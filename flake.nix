{
  # Keep this line accurate and one line long: `nix flake metadata` prints it,
  # and it is the first thing a cold agent learns about the repo.
  description = "all-chat-extension -- MV3 browser extension replacing native Twitch/YouTube/Kick chat with All-Chat. Run `nix flake show` for the command map.";

  # nixpkgs is the only input, on purpose.
  #
  # flake-utils would buy exactly one thing here -- eachDefaultSystem -- which is
  # the three-line genAttrs below. In exchange it costs a second lock node in
  # every repo (flake-utils transitively pulls `systems`, so really two), a
  # second upstream that can break one repo and not the other forty, and a
  # hardcoded system list this repo cannot edit. That list is currently broken:
  # it still contains x86_64-darwin, which now throws (see `systems` below).
  #
  # nixos-unstable is the same channel the author's own NixOS config tracks, so
  # `nix develop` here and `nixos-rebuild` there resolve the same store paths and
  # share one cache.
  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs =
    # `...` rather than a closed { self, nixpkgs }: adding a second input later
    # would otherwise fail with "called with unexpected argument 'self'".
    { nixpkgs, ... }:
    let
      lib = nixpkgs.lib;

      # x86_64-darwin is deliberately absent. nixpkgs 26.11 replaced that whole
      # attribute set with `throw "Nixpkgs 26.11 has dropped support for
      # x86_64-darwin"`. genAttrs is lazy, so plain `nix develop` on Linux would
      # not notice -- it detonates later, on `nix flake check --all-systems`.
      # Add it back only against a separate nixpkgs-26.05-darwin input.
      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "aarch64-darwin"
      ];

      # Stand-in for flake-utils.lib.eachDefaultSystem. Passes `pkgs` rather than
      # a system string, because that is what every call site below wants.
      forAllSystems = f: lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});

      # ======================================================================
      # PER-REPO BLOCK 1 -- the toolchain
      # ======================================================================
      # Node 24, pinned by MAJOR to match the repo's own single source of truth:
      # `.nvmrc` says 24, package.json says `engines.node: ">=24"`, and CI feeds
      # `.nvmrc` to actions/setup-node. ADR 006 explains why (Mozilla rejected a
      # 1.6.3 upload built on EOL Node 20), so do NOT relax this to `pkgs.nodejs`
      # -- a rolling alias is exactly the drift that ADR forbids. When `.nvmrc`
      # moves to the next LTS, change this attr in the same commit.
      #
      # npm ships inside the nodejs derivation; never add it separately. The repo
      # commits package-lock.json and CI runs `npm ci`, so npm is the package
      # manager here -- do not add pnpm or yarn beside it.
      #
      # Explicit `pkgs.foo`, never `with pkgs; [ ... ]`: when an attr disappears
      # in a nixpkgs bump, `with` reports a bare undefined identifier with no
      # hint of which set it came from, and the name is not greppable.
      toolchain = pkgs: [
        # ---- this repo's ecosystem ----
        pkgs.nodejs_24
        # A store `tsc`/`tsserver` for editors and for poking at types before
        # `dev-setup` has run. The build itself uses the repo's own pinned
        # typescript out of node_modules (ts-loader), not this one.
        pkgs.typescript
        # `npm run package` is literally `npm run build && cd dist && zip -r
        # ../allchat-extension.zip .` -- without zip that script dies at the last
        # step, after a full webpack build, which is a miserable way to find out.
        pkgs.zip

        # ---- present in every repo in the fleet ----
        pkgs.git
        pkgs.jq
        pkgs.gnumake
      ];

      # ======================================================================
      # PER-REPO BLOCK 2 -- libraries that get dlopened, not linked
      # ======================================================================
      # npm prebuilds carry .so files that are dlopened at runtime, so neither
      # patchelf nor the nix linker ever sees them and NixOS has no /usr/lib for
      # them to find. stdenv.cc.cc.lib supplies libstdc++. This repo's install
      # scripts are only esbuild and fsevents (a darwin no-op), so the list stays
      # at the fleet minimum -- LD_LIBRARY_PATH is a blunt instrument.
      nativeLibs = pkgs: [
        pkgs.stdenv.cc.cc.lib
        pkgs.zlib
      ];

      # ======================================================================
      # PER-REPO BLOCK 3 -- constant environment variables
      # ======================================================================
      # Only values that are constants belong here. Anything that must READ an
      # existing value (LD_LIBRARY_PATH), UNSET something (SOURCE_DATE_EPOCH) or
      # touch the work tree goes in the shellHook further down.
      #
      # This attrset is applied to BOTH surfaces -- the dev shell and every
      # `nix run` wrapper -- so a command cannot behave differently depending on
      # how it was invoked.
      #
      # Deliberately NOT set here:
      #   NODE_ENV -- `npm ci` with NODE_ENV=production skips devDependencies,
      #     which silently removes webpack, tsc and vitest from the tree.
      #   API_URL  -- webpack's DefinePlugin already defaults to
      #     https://allch.at for `--mode production` and http://localhost:8080
      #     for `--mode development`. Pinning it here would bake the prod URL
      #     into dev builds. Export it per invocation if you need an override.
      #   CI       -- playwright.config.ts branches on it (forbidOnly, retries).
      #   NPM_CONFIG_CACHE -- npm resolves a relative cache path against its own
      #     cwd, so anchoring it in the work tree would fork one cache per
      #     directory an agent happens to stand in. Left at ~/.npm, which is
      #     shared and warm; like go and maven, npm needs a writable $HOME.
      envVars = _pkgs: {
        # npm's install-time noise is pure cost in an agent's context window, and
        # `audit` is an extra network round trip on every single `npm ci`.
        NPM_CONFIG_FUND = "false";
        NPM_CONFIG_AUDIT = "false";
        NPM_CONFIG_UPDATE_NOTIFIER = "false";
        # Nothing in this flake runs Playwright (see the note on `test`), and
        # package-lock.json marks no install script for it -- but a stray
        # `npx playwright install` otherwise spends ten minutes fetching
        # ~1 GiB of prebuilt browsers that cannot start on stock NixOS.
        PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = "1";
      };

      # ======================================================================
      # PER-REPO BLOCK 4 -- the command map
      # ======================================================================
      # THE single source of truth. It generates `apps` (so `nix run .#build`
      # works), the `dev-*` wrappers on PATH inside the shell, and `dev-help`.
      # Nothing is written twice, so `nix flake show` can never disagree with
      # what `dev-build` actually runs.
      #
      # Verbs are the fleet's fixed vocabulary. `fmt` is deliberately ABSENT: the
      # repo has no formatter -- no prettier dependency and no
      # prettier/dprint/biome config anywhere in the tree -- so a `fmt` here
      # would impose a style this project never agreed to and rewrite every file
      # it touched. `test` and `lint` deliberately do NOT map to the package.json
      # scripts of the same name; both are explained at their definition.
      #
      # Everything delegates to package.json scripts rather than reimplementing
      # them, so the flake cannot drift from what CI runs. `--prefix "$REPO_ROOT"`
      # rather than a bare `npm run`: both `nix run` and `nix develop` start in
      # the caller's directory, and npm's upward search for package.json makes a
      # subdirectory invocation quietly ambiguous.
      commands = pkgs: {
        setup = {
          description = "(network) npm ci -- install node_modules from package-lock.json";
          text = ''npm --prefix "$REPO_ROOT" ci "$@"'';
        };
        build = {
          description = "webpack production build into dist/ (needs `setup` first)";
          text = ''npm --prefix "$REPO_ROOT" run build -- "$@"'';
        };
        test = {
          # This is `test:unit` (vitest + jsdom), NOT package.json's `test`.
          #
          # package.json's `test` is `playwright test --grep-invert @agent`, and
          # that suite cannot run from this flake for two independent reasons:
          # playwright.config.ts sets `headless: false` because MV3 extension
          # loading requires a headed browser (so it needs a real X/Wayland
          # display), and Playwright's own `npx playwright install` chromium is a
          # prebuilt dynamically-linked executable that will not start on stock
          # NixOS. The nixpkgs escape hatch exists and its version happens to
          # match this repo's @playwright/test exactly -- add
          # `pkgs.playwright-driver.browsers` (2.1 GiB closure) plus
          # PLAYWRIGHT_BROWSERS_PATH and pkgs.xvfb-run if you want that suite --
          # but 2.1 GiB on every cold `nix develop`, for a suite that also drives
          # live twitch.tv/youtube.com/kick.com pages, is not a trade this shell
          # makes by default.
          description = "run the vitest unit suite (needs `setup`; Playwright e2e is not covered -- see comment)";
          text = ''npm --prefix "$REPO_ROOT" run test:unit -- "$@"'';
        };
        lint = {
          # `tsc --noEmit`, which is the gate CI actually runs, and the only
          # static analysis that currently works in this repo: package.json also
          # defines `lint` as `eslint src --ext .ts,.tsx`, but no flat
          # eslint.config.* exists anywhere in the tree, so eslint 9 exits
          # non-zero before it looks at a single file. Wiring that up is a change
          # to the repo, not to this flake.
          description = "type-check with tsc --noEmit (needs `setup` first)";
          text = ''npm --prefix "$REPO_ROOT" run type-check -- "$@"'';
        };
        run = {
          description = "(long-running) webpack --watch dev build; load dist/ as an unpacked extension";
          text = ''npm --prefix "$REPO_ROOT" run dev -- "$@"'';
        };
      };

      # ======================================================================
      # GENERIC MACHINERY -- byte-identical in all 41 repos, do not edit
      # ======================================================================

      # Prepend, never assign: a host LD_LIBRARY_PATH may be carrying something
      # the user needs, and clobbering it breaks binaries they launch from here.
      # Linux only -- on darwin the loader variable is DYLD_*, and exporting a
      # Linux-shaped value there is at best useless.
      ldPreamble =
        pkgs:
        lib.optionalString (pkgs.stdenv.hostPlatform.isLinux && nativeLibs pkgs != [ ]) ''
          export LD_LIBRARY_PATH="${lib.makeLibraryPath (nativeLibs pkgs)}''${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
        '';

      # Every command gets $REPO_ROOT. `nix run` and `nix develop` both start in
      # whatever directory they were invoked from, so a bare `.venv` silently
      # forks a second environment as soon as an agent works from a subdirectory.
      # Note we do NOT cd there: commands act on the caller's cwd on purpose.
      rootPreamble = ''
        REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
        export REPO_ROOT
      '';

      # One derivation per command, reused by both `apps` and the dev shell, so
      # the two can never diverge. `dev-` prefixed because a bare `test` binary
      # earlier on PATH would shadow the POSIX shell builtin and quietly break
      # every script in the repo that uses it.
      wrappers =
        pkgs:
        lib.mapAttrs (
          name: cmd:
          pkgs.writeShellApplication {
            name = "dev-${name}";
            runtimeInputs = toolchain pkgs;
            runtimeEnv = envVars pkgs;
            meta.description = cmd.description;
            text = ''
              ${rootPreamble}
              ${ldPreamble pkgs}
              ${cmd.text}
            '';
          }
        ) (commands pkgs);

      helpFor =
        pkgs:
        let
          cmds = commands pkgs;
          names = lib.attrNames cmds;
          width = lib.foldl' (a: n: lib.max a (builtins.stringLength n)) 0 names;
          pad = n: n + lib.concatStrings (lib.genList (_: " ") (width - builtins.stringLength n));
          line = n: c: "  dev-${pad n}  ${c.description}";
        in
        pkgs.writeShellApplication {
          name = "dev-help";
          meta.description = "print this repo's command map (works offline)";
          text = ''
            cat <<'EOF'
            ${lib.concatStringsSep "\n" (lib.mapAttrsToList line cmds)}
            EOF
          '';
        };
    in
    {
      # `nix flake show` -- the discovery entrypoint, and deliberately the whole
      # machine-facing contract: every app carries a meta.description, which
      # `nix flake show` prints inline and `nix flake show --json` exposes at
      # .apps.<system>.<name>.description. Pure evaluation, so an agent gets the
      # entire command map in one cheap call without reading a README.
      #
      # Do NOT invent a top-level output for this (`agentManifest`, `probeThing`
      # ...). Nix answers with `warning: unknown flake output '<name>'` on every
      # single `nix flake check`, forever.
      apps = forAllSystems (
        pkgs:
        lib.mapAttrs (name: cmd: {
          type = "app";
          program = "${(wrappers pkgs).${name}}/bin/dev-${name}";
          meta.description = cmd.description;
        }) (commands pkgs)
      );

      # `nix develop` -- the toolchain, plus a dev-<verb> for every app.
      devShells = forAllSystems (pkgs: {
        default = pkgs.mkShell {
          packages = toolchain pkgs ++ lib.attrValues (wrappers pkgs) ++ [ (helpFor pkgs) ];

          env = envVars pkgs;

          # Some C extensions and node-gyp addons compile at -O0, where glibc's
          # _FORTIFY_SOURCE becomes a hard error instead of a warning.
          hardeningDisable = [ "fortify" ];

          shellHook = ''
            # mkShell inherits SOURCE_DATE_EPOCH=315532800 (1980-01-01) from
            # stdenv, and any wheel or zip built in here then dies with "ZIP does
            # not support timestamps before 1980".
            unset SOURCE_DATE_EPOCH

            ${rootPreamble}
            ${ldPreamble pkgs}

            # Nothing networked, nothing stateful and nothing interactive above
            # this line, and nothing below it either. No venv creation, no
            # `npm install`, no `dotnet restore`, no `read`, no `exec $SHELL`.
            # Bootstrapping in the hook makes a cold `nix develop -c pytest`
            # start downloading before it runs anything, on EVERY invocation --
            # the exact failure an unattended agent cannot diagnose. That is what
            # `dev-setup` is for.

            # The banner is interactive-only, and this guard is load-bearing:
            # shellHook output lands on the STDOUT of `nix develop -c <cmd>`, so
            # an unguarded echo corrupts anything parsing it
            # (`nix develop -c cat x.json | jq` fails to parse). $- is the only
            # reliable discriminator here -- it lacks `i` for `nix develop -c`
            # and has it at an interactive prompt. Do not test $PS1 (unset in
            # both) or $IN_NIX_SHELL (set in both). >&2 is the second layer, for
            # the case where a caller runs us on a pty.
            case $- in
              *i*) echo "all-chat-extension dev shell -- 'dev-help' for the command map" >&2 ;;
            esac
          '';
        };
      });

      # `nix flake check` -- honest by construction. It realises the toolchain
      # closure (so a typo'd or currently-broken attr fails here) and builds
      # every wrapper, which runs shellcheck over every command text. Add real
      # test derivations beside it. NEVER add a check that always passes: an
      # agent reads "all checks passed!" as a signal, and a fake check makes
      # `nix flake check` a liar.
      checks = forAllSystems (pkgs: {
        toolchain =
          pkgs.runCommand "toolchain-check"
            {
              nativeBuildInputs = toolchain pkgs ++ lib.attrValues (wrappers pkgs);
            }
            ''
              for verb in ${lib.escapeShellArgs (lib.attrNames (commands pkgs))}; do
                command -v "dev-$verb" > /dev/null || {
                  echo "dev-$verb is not on PATH" >&2
                  exit 1
                }
              done
              touch "$out"
            '';
      });

      # `nix fmt` -- formats the *Nix* in this repo; project code is `dev-fmt`.
      # nixfmt-tree (the treefmt wrapper) rather than bare nixfmt, because bare
      # nixfmt tries to parse every path handed to it and fails on non-Nix files.
      # This file ships already formatted, so `nix fmt` is a no-op rather than a
      # diff in 41 repos.
      formatter = forAllSystems (pkgs: pkgs.nixfmt-tree);
    };
}
