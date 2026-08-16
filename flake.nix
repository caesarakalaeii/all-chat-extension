{
  # Keep this line accurate and one line long: `nix flake metadata` prints it,
  # and it is the first thing a cold agent learns about the repo.
  description = "all-chat-extension -- MV3 browser extension replacing native Twitch/YouTube/Kick chat with All-Chat. Run `nix flake show` for the command map.";

  # nixpkgs is the only input, on purpose. flake-utils would buy exactly one
  # thing here -- eachDefaultSystem -- which the canonical machinery below
  # already provides, together with the system list it iterates. In exchange it
  # would cost two more lock nodes, not one (`nix flake metadata
  # github:numtide/flake-utils` shows it pulls `systems`), and a second upstream
  # that can break this repo without touching nixpkgs.
  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs =
    # `self` is mandatory: the canonical machinery anchors every verb on it, and
    # a flake whose outputs omit it does not evaluate. `...` rather than a
    # closed { self, nixpkgs }: adding a second input later would otherwise fail
    # with "called with unexpected argument".
    { self, nixpkgs, ... }:
    let
      lib = nixpkgs.lib;

      # ======================================================================
      # PER-REPO BLOCK 1 -- the toolchain
      # ======================================================================
      # Node 24, pinned by MAJOR to match the repo's own single source of truth:
      # `.nvmrc` contains `24`, package.json declares `engines.node: ">=24"`, and
      # both jobs in .github/workflows/build-and-release.yml consume it via
      # actions/setup-node's `node-version-file: '.nvmrc'`. docs/adr/006-node-
      # build-environment-lts-policy.md records why: on 2026-06-09 the Mozilla
      # Add-ons team flagged version 1.6.3 under "Unsupported build tools or
      # environments" because CI built it on Node 20, EOL since 2026-04-30. So
      # do NOT relax this to `pkgs.nodejs` -- a rolling alias is exactly the
      # drift that ADR forbids. When `.nvmrc` moves to the next LTS, change this
      # attr in the same commit. (Resolves to nodejs-24.19.0 at the locked rev.)
      #
      # npm ships inside the nodejs derivation -- nodejs_24/bin holds corepack,
      # node, npm and npx, npm 11.17.0 -- so never add it separately. The repo
      # commits package-lock.json and CI runs `npm ci`, so npm is the package
      # manager here; do not add pnpm or yarn beside it.
      #
      # Explicit `pkgs.foo`, never `with pkgs; [ ... ]`: when an attr disappears
      # in a nixpkgs bump, `with` reports a bare undefined identifier with no
      # hint of which set it came from, and the name is not greppable.
      toolchain = pkgs: [
        pkgs.nodejs_24
        # A store tsc/tsserver for an editor, and for poking at types before
        # `dev-setup` has run. No verb reaches it: `npm run` puts
        # node_modules/.bin ahead of $PATH (measured with a shim), so `dev-lint`
        # gets the repo's own typescript, and webpack compiles through
        # ts-loader, which resolves `typescript` out of node_modules and never
        # consults $PATH at all. Both happen to be 5.9.3 today.
        pkgs.typescript
        # `npm run package` is literally `npm run build && cd dist && zip -r
        # ../allchat-extension.zip .`. No verb here runs it -- CI does, and a
        # human in this shell will -- and without zip it dies at the last step,
        # after a full webpack build, which is a miserable way to find out.
        pkgs.zip
        # Neither is run by any verb; both are for the human or agent at the
        # prompt. git because this is a git checkout (the anchor in the
        # machinery below deliberately does not need it), jq because the JSON
        # files at the repo root -- manifest.json, package.json,
        # package-lock.json, tsconfig.json -- are what one reads first.
        pkgs.git
        pkgs.jq
      ];

      # ======================================================================
      # PER-REPO BLOCK 2 -- libraries that get dlopened, not linked
      # ======================================================================
      # Empty, and that is a measurement rather than an omission. `npm ci` in
      # this tree unpacks exactly three prebuilt native addons --
      # lightningcss-linux-x64-gnu, @rollup/rollup-linux-x64-gnu and
      # @tailwindcss/oxide-linux-x64-gnu -- and `ldd` shows their only non-glibc
      # dependency is libgcc_s.so.1, which pkgs.nodejs_24 already has in its own
      # RPATH (alongside libstdc++.so.6), so it is loaded before node dlopens
      # anything. Loading all three via `node -e 'process.dlopen(...)'` under
      # pkgs.nodejs_24 with LD_LIBRARY_PATH unset succeeds. The only other
      # packages in package-lock.json with an install script are esbuild (a
      # statically linked Go binary) and fsevents (darwin-only). There is
      # therefore nothing for LD_LIBRARY_PATH to fix here; add an entry only
      # when a real dlopen failure names the missing soname.
      nativeLibs = _pkgs: [ ];

      # ======================================================================
      # PER-REPO BLOCK 3 -- constant environment variables
      # ======================================================================
      # Constants only. Anything that must READ an existing value
      # (LD_LIBRARY_PATH), UNSET something (SOURCE_DATE_EPOCH) or touch the work
      # tree belongs in the machinery's preambles, not here. This attrset is
      # applied to BOTH surfaces -- the dev shell and every `nix run` wrapper --
      # so a command cannot behave differently depending on how it was invoked.
      #
      # Deliberately NOT set here:
      #   NODE_ENV -- `NODE_ENV=production npm config get omit` prints `dev`
      #     (measured; unset it and the answer is empty), so pinning it would
      #     make `npm ci` skip devDependencies, which is where webpack,
      #     typescript and vitest live.
      #   API_URL  -- webpack.config.js already defaults it to https://allch.at
      #     under `--mode production` and http://localhost:8080 under `--mode
      #     development`, and feeds it to DefinePlugin. Pinning it here would
      #     bake one of those into the other. Export it per invocation instead.
      #   CI       -- playwright.config.ts branches on it (`forbidOnly`,
      #     `retries`).
      #   NPM_CONFIG_CACHE -- npm resolves a relative cache path against its own
      #     cwd: with NPM_CONFIG_CACHE=relcache, `npm config get cache` prints
      #     /tmp/relcache from /tmp and /home/relcache from /home (measured), so
      #     anchoring it relatively would fork one cache per directory an agent
      #     happens to stand in. Left at npm's default under $HOME.
      envVars = _pkgs: {
        # npm's install-time noise is pure cost in an agent's context window,
        # and `audit` is an extra network round trip on every `npm ci`. With
        # these three exported, `npm config get fund audit update-notifier`
        # answers false/false/false.
        NPM_CONFIG_FUND = "false";
        NPM_CONFIG_AUDIT = "false";
        NPM_CONFIG_UPDATE_NOTIFIER = "false";
        # playwright-core 1.61.1 reads this in exactly two places: its
        # npm-install path (`installBrowsersForNpmInstall`) and
        # `ensureConfiguredBrowserInstalled`. It is inert for `dev-setup` as the
        # lockfile stands -- esbuild and fsevents are the only entries with an
        # install script -- and it does NOT stop an explicit `npx playwright
        # install`. It is set so that a lockfile that does register one cannot
        # turn `npm ci` into a multi-gigabyte browser download inside an agent's
        # setup step.
        PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = "1";
      };

      # ======================================================================
      # PER-REPO BLOCK 4 -- the command map
      # ======================================================================
      # THE single source of truth: it generates `apps` (so `nix run .#build`
      # works), the `dev-*` wrappers on PATH inside the shell, and `dev-help`.
      # Nothing is written twice, so `nix flake show` cannot disagree with what
      # `dev-build` runs.
      #
      # `fmt` is deliberately ABSENT: this repo has no formatter -- no
      # prettier/dprint/biome dependency in package.json and no config for one
      # tracked anywhere in the tree -- so a `fmt` verb would impose a style the
      # project never chose and rewrite every file it touched. Absence is
      # information; a stub that echoes "not applicable" would not be.
      #
      # Everything delegates to a package.json script rather than
      # reimplementing it, so the flake cannot drift from what CI runs. The
      # anchor in every text is `--prefix "$REPO_ROOT"`, not the trailing
      # `"$@"`: `npm --prefix DIR run <script>` both resolves DIR/package.json
      # and executes the script with DIR as its cwd, from anywhere (measured),
      # which is what keeps a build invoked from a subdirectory -- or from
      # another repo entirely -- pointed at this tree. The `"$@"` only forwards
      # extra arguments.
      commands = pkgs: {
        setup = {
          description = "(network) npm ci -- install node_modules from package-lock.json";
          text = ''
            need_writable_checkout
            npm --prefix "$REPO_ROOT" ci "$@"
          '';
        };
        build = {
          description = "webpack production build into dist/ (needs `setup` first)";
          text = ''
            need_writable_checkout
            npm --prefix "$REPO_ROOT" run build -- "$@"
          '';
        };
        test = {
          # vitest over tests/unit, i.e. package.json's `test:unit` -- NOT its
          # `test`, which is `npx playwright test --grep-invert @agent`. That
          # suite cannot run from this flake: playwright.config.ts sets
          # `headless: false`, and the specs navigate live https://www.twitch.tv,
          # https://www.youtube.com and https://kick.com URLs, so it wants a
          # display and the public internet. nixpkgs could supply the browsers
          # -- pkgs.playwright-driver is 1.61.1, exactly the @playwright/test
          # version package-lock.json pins -- but pkgs.playwright-driver.browsers
          # is a 2.1 GiB closure -- `nix path-info -S` against cache.nixos.org
          # at the LOCKED rev reports 2304223264 bytes, and the same query on a
          # newer nixpkgs answers 3773966048, so re-measure it if you bump the
          # lock. That is not a cost this shell imposes on every cold
          # `nix develop`. Add it, PLAYWRIGHT_BROWSERS_PATH and xvfb-run if you
          # want that suite.
          #
          # Guarded: vitest writes a run cache into the tree
          # (node_modules/.vite/vitest/<hash>/results.json, observed).
          description = "run the vitest unit suite (needs `setup`; the Playwright e2e suite is not covered -- see comment)";
          text = ''
            need_writable_checkout
            npm --prefix "$REPO_ROOT" run test:unit -- "$@"
          '';
        };
        lint = {
          # `tsc --noEmit`, which is the gate CI actually runs (the "Type check"
          # step of build-and-release.yml) and the only static analysis in this
          # repo that works today: package.json also defines `lint` as `eslint
          # src --ext .ts,.tsx`, but no eslint.config.* is tracked anywhere in
          # the tree, so eslint 9.39.5 exits 2 with "ESLint couldn't find an
          # eslint.config.(js|mjs|cjs) file" before it reads a source file.
          # Wiring that up is a change to the repo, not to this flake.
          #
          # The one unguarded verb, on purpose: tsconfig.json sets `noEmit` and
          # no `incremental`, and a run leaves no new or modified file behind
          # (observed), so this stays usable from outside a checkout, where it
          # grades the read-only $SRC_ROOT snapshot instead of refusing.
          description = "type-check with tsc --noEmit (needs `setup` first)";
          text = ''npm --prefix "$REPO_ROOT" run type-check -- "$@"'';
        };
        run = {
          description = "(long-running) webpack --watch dev build; load dist/ as an unpacked extension";
          text = ''
            need_writable_checkout
            npm --prefix "$REPO_ROOT" run dev -- "$@"
          '';
        };
      };

      # ======================================================================
      # PER-REPO BLOCK 5 -- the name in the interactive dev-shell banner
      # ======================================================================
      repoName = "all-chat-extension";

      # ======================================================================
      # PER-REPO BLOCK 6 -- checks that only make sense for this repo
      # ======================================================================
      # The machinery's `anchoring` check proves the anchor and the guard behave
      # in isolation. It cannot prove that THIS repo's verbs call them, which is
      # the half that regresses when somebody adds a command. This probe drives
      # the real wrappers inside a decoy that carries the marker files of this
      # ecosystem, and every script in the decoy's package.json writes a file,
      # so a verb that resolved to the decoy leaves evidence rather than failing
      # quietly.
      #
      # What it cannot cover: none of these verbs can be run for real in a nix
      # sandbox, because every one of them needs a node_modules that only
      # `npm ci` (network) can produce.
      extraChecks = pkgs: {
        verbAnchoring =
          pkgs.runCommand "verb-anchoring-check"
            {
              nativeBuildInputs = lib.attrValues (wrappers pkgs);
            }
            ''
              set -euo pipefail
              HOME=$PWD/home
              export HOME
              mkdir -p "$HOME"

              mkdir decoy
              printf '%s\n' \
                '{' \
                '  "name": "decoy-not-this-repo",' \
                '  "version": "0.0.0",' \
                '  "scripts": {' \
                '    "build": "echo leaked > leaked-build",' \
                '    "dev": "echo leaked > leaked-dev",' \
                '    "type-check": "echo leaked > leaked-type-check",' \
                '    "test:unit": "echo leaked > leaked-test-unit"' \
                '  }' \
                '}' > decoy/package.json
              printf '{ description = "not this repo"; outputs = _: { }; }\n' > decoy/flake.nix
              printf 'export const decoyOnly: number = "not a number";\n' > decoy/decoy-only.ts
              cp -r decoy decoy.orig

              # Every writing verb must refuse in a tree that is not this repo,
              # and refuse for the right reason: the grep pins the failure to
              # need_writable_checkout rather than to npm tripping over
              # something unrelated.
              for verb in setup build test run; do
                if ( cd decoy && "dev-$verb" ) > "$verb.log" 2>&1; then
                  echo "dev-$verb ran to completion in a tree that is not this repo" >&2
                  cat "$verb.log" >&2
                  exit 1
                fi
                if ! grep -q 'needs a writable' "$verb.log"; then
                  echo "dev-$verb failed for some reason other than the guard" >&2
                  cat "$verb.log" >&2
                  exit 1
                fi
              done

              # `lint` is unguarded, so it must instead grade THIS repo. npm
              # echoes the package and script it resolved before running it, and
              # that banner is the proof: `allchat-extension@` can only come
              # from $SRC_ROOT/package.json. Its exit code is deliberately not
              # asserted -- it depends on a node_modules that does not exist
              # here -- and neither is a path, because tsc prints paths relative
              # to its cwd, which is exactly the thing under test.
              ( cd decoy && dev-lint ) > lint.log 2>&1 || true
              if ! grep -q 'allchat-extension@' lint.log; then
                echo "dev-lint did not resolve this repo's package.json" >&2
                cat lint.log >&2
                exit 1
              fi
              if grep -q 'decoy' lint.log; then
                echo "dev-lint read the decoy" >&2
                cat lint.log >&2
                exit 1
              fi

              # The logs live beside the decoy, not in it, so this compares the
              # decoy against its pristine copy with nothing excluded.
              diff -r decoy decoy.orig

              touch "$out"
            '';
      };

      # >>>>> BEGIN CANONICAL MACHINERY v1 <<<<<
      # ======================================================================
      # Everything from the BEGIN sentinel above to the END sentinel on the last
      # line of this file is fleet-canonical text: the same bytes in every repo
      # that carries this flake style. That is a checkable claim, not a boast --
      #
      #   sed -n '/BEGIN CANONICAL MACHINERY v1/,$p' flake.nix | sha256sum
      #
      # prints the same digest in every repo, or one of them has been edited.
      # (`,$p`, not a range ending on the END sentinel: a range whose closing
      # pattern were spelled out here would terminate on this very comment.)
      # Nothing here names a repository, a language, a tool or a project file.
      # If you find such a name below, it is contamination: the fix is to move
      # it into the per-repo section above, never to special-case it here.
      #
      # This region READS exactly these names from the per-repo section:
      #   nixpkgs  self  lib  repoName  toolchain  nativeLibs  envVars
      #   commands  extraChecks
      # and DEFINES exactly these:
      #   systems  forAllSystems  ldPreamble  rootPreamble  guardPreamble
      #   wrappers  helpFor  anchorCheck
      # plus the four flake outputs apps / devShells / checks / formatter.
      # Anything else in scope is invisible to it. The types of those eight
      # inputs, and the shell variables this region exports into command texts,
      # are specified in INTERFACE.md, which travels with this block.
      #
      # To change behaviour here you change it in every repo at once and bump
      # the version in both sentinels. A local edit is a bug by construction:
      # the digest above stops matching, and -- because rootPreamble anchors on
      # flake.nix byte-identity -- an edited working tree also stops being
      # recognised by wrappers built from the previous revision.
      # ======================================================================

      # ---- systems policy: decided once for the whole fleet ----
      #
      # Read this list as "evaluated on three, built on one". That is what was
      # measured, and it is all it means:
      #   * `nix flake check --all-systems` passes, so every output attribute
      #     below EVALUATES on all three systems.
      #   * only x86_64-linux has ever been BUILT. The machine this was verified
      #     on has no aarch64 emulation -- no binfmt handler, and `extra-
      #     platforms` is x86-only -- so aarch64 cannot be built there at all.
      # It is not a statement that anything works on aarch64. Do not upgrade it
      # into one in a README.
      #
      # Evaluating all three is still worth its seconds, because the failure it
      # catches is an eval-time failure: a `pkgs.<attr>` that exists on Linux
      # and not on darwin (`stdenv.cc.cc.lib` is the usual one) throws during
      # evaluation, and `nix flake check` without --all-systems checks only the
      # current system and sails straight past it.
      #
      # x86_64-darwin is deliberately absent. nixpkgs 26.11 replaced that whole
      # attribute set with a `throw`. genAttrs is lazy, so plain `nix develop`
      # on Linux would not notice -- it detonates later, on the --all-systems
      # run this policy requires. Add it back only against a separate
      # nixpkgs-26.05-darwin input.
      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "aarch64-darwin"
      ];

      # Stand-in for flake-utils.lib.eachDefaultSystem. Passes `pkgs` rather
      # than a system string, because that is what every call site wants, and
      # keeps the system list in this file rather than in a second input's
      # hardcoded copy of it.
      forAllSystems = f: lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});

      # Prepend, never assign: a host LD_LIBRARY_PATH may be carrying something
      # the user needs, and clobbering it breaks binaries they launch from here.
      # Linux only -- on darwin the loader variable is DYLD_*, and exporting a
      # Linux-shaped value there is at best useless.
      #
      # `&&` short-circuits in Nix, so on darwin `nativeLibs pkgs` is never
      # forced. That is load-bearing for the systems policy above: it is what
      # lets a repo list Linux-only attrs in nativeLibs and still evaluate on
      # aarch64-darwin. Do not reorder the two operands.
      ldPreamble =
        pkgs:
        lib.optionalString (pkgs.stdenv.hostPlatform.isLinux && nativeLibs pkgs != [ ]) ''
          export LD_LIBRARY_PATH="${lib.makeLibraryPath (nativeLibs pkgs)}''${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
        '';

      # Every command gets $SRC_ROOT and $REPO_ROOT. `nix run` and `nix develop`
      # both start in whatever directory they were invoked from, and no verb may
      # act on that directory -- these two are what it acts on instead.
      #
      # $SRC_ROOT is this flake's own source, snapshotted into the store when
      # the flake was evaluated. It is the one anchor that is always available:
      # `nix run /path/to/repo#lint` tells the running program nothing whatever
      # about /path/to/repo (flake refs are location-independent by design, and
      # there is no $FLAKE_DIR to read), so without `self` a wrapper invoked
      # that way has literally no way to name the repo it belongs to. Two
      # limitations worth knowing: it is read-only, being a store path, and in a
      # git checkout it contains only TRACKED files.
      #
      # $REPO_ROOT is the writable checkout when the caller is standing in one,
      # and $SRC_ROOT when they are not. Three things this deliberately is NOT:
      #
      #   * NOT `pwd`. A fallback to the caller's directory is how `fmt`
      #     rewrites a stranger's source tree and how `lint` prints "all checks
      #     passed" having read none of this repo.
      #   * NOT `git rev-parse --show-toplevel`. Run from inside some OTHER git
      #     repo it cheerfully answers with THAT repo's top level. It also needs
      #     git on PATH and a .git directory, so it fails on an export and in
      #     any wrapper whose toolchain omits git.
      #   * NOT an inherited $REPO_ROOT from the environment. The dev shell
      #     EXPORTS this variable, so honouring it would mean that running
      #     `nix run /path/to/B#fmt` from inside repo A's dev shell points B's
      #     formatter at A. An explicit path argument is how a caller overrides
      #     a verb's target; an ambient variable is how they do it by accident.
      #
      # Instead: walk up from $PWD and take the first ancestor that IS this
      # repo, proved by carrying a byte-identical flake.nix. A single tracked
      # filename, a marker directory, or a set of them is not proof -- sibling
      # repos in a fleet share those, and a decoy can be built to carry any list
      # of names you care to publish. The whole flake.nix is what distinguishes
      # repos, because description, toolchain and command map all differ, so the
      # whole flake.nix is what gets compared. Compared with bash's own
      # `$(<file)` rather than cmp or sha256sum, so the check depends on no
      # package at all -- pure builtins, correct even in a wrapper whose PATH
      # carries nothing but the repo's own toolchain.
      #
      # Consequence worth knowing: edit flake.nix and the dev-* wrappers in an
      # already-open `nix develop` stop recognising the tree, because they were
      # built from the previous flake.nix. That is a stale shell telling you so
      # -- re-enter it. `nix run` re-evaluates every time and never sees this.
      rootPreamble = ''
        SRC_ROOT=${lib.escapeShellArg "${self}"}
        export SRC_ROOT

        _dev_find_root() {
          local dir ref
          ref=$(<"$SRC_ROOT/flake.nix") || return 1
          dir=$(
            unset CDPATH
            cd -P -- "''${1:-.}" 2>/dev/null && pwd
          ) || return 1
          while [ -n "$dir" ]; do
            if [ -f "$dir/flake.nix" ] && [ "$(<"$dir/flake.nix")" = "$ref" ]; then
              printf '%s\n' "$dir"
              return 0
            fi
            dir=''${dir%/*}
          done
          return 1
        }

        REPO_ROOT="$(_dev_find_root "$PWD" || printf '%s\n' "$SRC_ROOT")"
        export REPO_ROOT
      '';

      # Wrappers only, not the shellHook -- an interactive shell has no business
      # carrying this function around. Any command text that writes files calls
      # it first, and it is the reason a mutating verb can fail loudly instead
      # of falling back to "well, the cwd then".
      #
      # The test is $REPO_ROOT != $SRC_ROOT, i.e. "rootPreamble found a real
      # checkout", not a permission or a store-path-prefix test. Both of those
      # answer a narrower question: a checkout may be read-only for unrelated
      # reasons, and a store path is not the only tree we must refuse to write.
      guardPreamble = ''
        need_writable_checkout() {
          if [ "$REPO_ROOT" != "$SRC_ROOT" ]; then
            return 0
          fi
          echo "''${0##*/}: this command rewrites files, so it needs a writable" >&2
          echo "checkout of this repo -- and standing in $PWD there is none: no" >&2
          echo "parent directory carries this flake's flake.nix. The only tree in" >&2
          echo "reach is the read-only store snapshot $SRC_ROOT, and rewriting" >&2
          echo "$PWD instead is exactly the bug this guard exists to prevent." >&2
          echo "cd into the repo (or \`nix develop\` it), or pass an explicit path." >&2
          exit 1
        }
      '';

      # One derivation per command, reused by both `apps` and the dev shell, so
      # the two can never diverge. `dev-` prefixed because a bare `test` binary
      # earlier on PATH would shadow the POSIX shell builtin and quietly break
      # every script in the repo that uses it.
      #
      # writeShellApplication, not writeShellScriptBin: it runs shellcheck at
      # BUILD time and sets `set -euo pipefail`, so an unquoted $@ or a silently
      # ignored failure is a `nix flake check` failure rather than a surprise in
      # front of an agent.
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
              ${guardPreamble}
              ${ldPreamble pkgs}
              ${cmd.text}
            '';
          }
        ) (commands pkgs);

      # `dev-help` is generated from the same attrset as everything else, so it
      # cannot describe a verb that does not exist or miss one that does. No
      # runtimeInputs: printing the map must work with nothing installed.
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

      # The regression gate for rootPreamble and guardPreamble, which are the
      # two pieces of this flake that can silently damage a tree that is not
      # this repo. It tests the MECHANISM, not any verb, which is precisely what
      # makes it fleet-generic: it needs to know nothing about what this repo
      # does, only that the anchor resolves and the guard refuses.
      #
      # The decoy is a real directory carrying a real flake.nix that differs.
      # Marker-file anchors pass a decoy like this -- that is the whole point of
      # the probe -- and so does any anchor that trusts `pwd`. Probe 2 is the
      # other half, and without it a guard that refused everything would score a
      # perfect pass: a tree that IS byte-identical must still be adopted, or
      # every mutating verb in the repo is dead. Probe 3 pins the subdirectory
      # case, which is the normal one for an agent working inside a repo.
      #
      # A per-repo probe that drives the actual verbs is strictly better and
      # cannot live here -- it has to know which verb writes and which needs a
      # network. INTERFACE.md shows how to add one via `extraChecks`.
      anchorCheck =
        pkgs:
        pkgs.runCommand "anchor-check" { } ''
          set -euo pipefail

          # The two preambles under test, verbatim, in a file the probes source.
          # A quoted heredoc, so every $ below is the bash the wrappers see.
          cat > preamble.sh <<'CANONICAL_PREAMBLE_EOF'
          ${rootPreamble}
          ${guardPreamble}
          CANONICAL_PREAMBLE_EOF

          mkdir decoy
          printf '{\n  description = "a different repo";\n  outputs = _: { };\n}\n' > decoy/flake.nix
          printf 'do not touch me\n' > decoy/victim.txt
          cp -r decoy decoy.orig

          # ---- probe 1: a foreign tree must not be adopted ----
          if ! ( cd decoy && . ../preamble.sh && [ "$REPO_ROOT" = "$SRC_ROOT" ] ); then
            echo "anchor adopted a directory that is not this repo" >&2
            exit 1
          fi
          # In a subshell: need_writable_checkout ends in `exit`, which would
          # otherwise take this whole build down instead of failing a condition.
          if ( cd decoy && . ../preamble.sh && need_writable_checkout ) > guard.log 2>&1; then
            echo "need_writable_checkout accepted a tree that is not this repo" >&2
            exit 1
          fi
          if ! diff -r decoy decoy.orig; then
            echo "the probes modified the foreign tree" >&2
            exit 1
          fi

          # ---- probe 2: a byte-identical checkout must be adopted ----
          cp -r ${lib.escapeShellArg "${self}"} checkout
          chmod -R u+w checkout
          if ! ( cd checkout && . ../preamble.sh &&
                 [ "$REPO_ROOT" = "$(pwd -P)" ] && need_writable_checkout ); then
            echo "anchor refused a byte-identical checkout of this repo" >&2
            exit 1
          fi

          # ---- probe 3: from a subdirectory, still the checkout root ----
          mkdir -p checkout/probe3/deeper
          if ! ( cd checkout/probe3/deeper && . ../../../preamble.sh &&
                 [ "$REPO_ROOT" = "$(cd -P ../.. && pwd)" ] ); then
            echo "anchor did not walk up to the checkout root from a subdirectory" >&2
            exit 1
          fi

          touch "$out"
        '';
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

          # Natively-compiled extension modules are routinely built at -O0,
          # where glibc's _FORTIFY_SOURCE stops being a warning and becomes a
          # hard error.
          hardeningDisable = [ "fortify" ];

          shellHook = ''
            # mkShell inherits SOURCE_DATE_EPOCH=315532800 (1980-01-01) from
            # stdenv, and any wheel or zip built in here then dies with "ZIP does
            # not support timestamps before 1980".
            unset SOURCE_DATE_EPOCH

            # $REPO_ROOT and $SRC_ROOT are exported here as a convenience for
            # the human at the prompt. Every wrapper re-resolves them from
            # scratch and none of them reads these, on purpose: a stale value
            # exported by one repo's shell must never steer another repo's verb.
            ${rootPreamble}
            ${ldPreamble pkgs}

            # Nothing networked, nothing stateful and nothing interactive above
            # this line, and nothing below it either. No environment
            # bootstrapping, no dependency installation, no `read`, no
            # `exec $SHELL`. Bootstrapping in the hook makes a cold
            # `nix develop -c <anything>` start downloading before it runs
            # anything, on EVERY invocation -- the exact failure an unattended
            # agent cannot diagnose. That is what a `setup` verb is for.

            # The banner is interactive-only, and this guard is load-bearing:
            # shellHook output lands on the STDOUT of `nix develop -c <cmd>`, so
            # an unguarded echo corrupts anything parsing it
            # (`nix develop -c cat x.json | jq` fails to parse). $- is the only
            # reliable discriminator here -- it lacks `i` for `nix develop -c`
            # and has it at an interactive prompt. Do not test $PS1 (unset in
            # both) or $IN_NIX_SHELL (set in both). >&2 is the second layer, for
            # the case where a caller runs us on a pty.
            case $- in
              *i*) echo "${repoName} dev shell -- 'dev-help' for the command map" >&2 ;;
            esac
          '';
        };
      });

      # `nix flake check` -- honest by construction, and the only gate this
      # style has. `toolchain` realises the whole toolchain closure (so a typo'd
      # or currently-broken attr fails here, not halfway through a task) and
      # builds every wrapper, which runs shellcheck over every command text.
      # `anchoring` is the regression test described above.
      #
      # Repo-specific checks go in `extraChecks`, never here. They may not
      # shadow either canonical name: silently replacing `anchoring` with
      # something weaker is the exact failure this whole file exists to make
      # impossible, so a collision is an eval error with both names in it.
      #
      # NEVER add a check that always passes. An agent reads "all checks
      # passed!" as a signal, and a fake check makes `nix flake check` a liar.
      checks = forAllSystems (
        pkgs:
        let
          canonical = {
            toolchain =
              pkgs.runCommand "toolchain-check"
                {
                  nativeBuildInputs = toolchain pkgs ++ lib.attrValues (wrappers pkgs) ++ [ (helpFor pkgs) ];
                }
                ''
                  set -euo pipefail
                  dev-help > help.txt

                  # A while-read over a heredoc rather than `for x in <list>`,
                  # which is a bash syntax error when the list is empty -- and a
                  # repo with no verbs yet is a legitimate state.
                  while IFS= read -r verb; do
                    [ -n "$verb" ] || continue
                    command -v "dev-$verb" > /dev/null || {
                      echo "dev-$verb is not on PATH" >&2
                      exit 1
                    }
                    grep -q -- "dev-$verb" help.txt || {
                      echo "dev-$verb is missing from the dev-help map" >&2
                      exit 1
                    }
                  done <<'CANONICAL_VERBS_EOF'
                  ${lib.concatStringsSep "\n" (lib.attrNames (commands pkgs))}
                  CANONICAL_VERBS_EOF

                  touch "$out"
                '';
            anchoring = anchorCheck pkgs;
          };
          extra = extraChecks pkgs;
          clash = lib.intersectLists (lib.attrNames canonical) (lib.attrNames extra);
        in
        if clash != [ ] then
          throw "extraChecks must not redefine canonical checks: ${lib.concatStringsSep ", " clash}"
        else
          canonical // extra
      );

      # `nix fmt` -- formats the *Nix* in this repo; project code gets a `fmt`
      # verb. nixfmt-tree (the treefmt wrapper) rather than bare nixfmt, because
      # bare nixfmt tries to parse every path handed to it and fails on non-Nix
      # files. This file ships already formatted, so `nix fmt` is a no-op rather
      # than a diff across the fleet.
      #
      # This is the one verb here NOT anchored to $REPO_ROOT, and it cannot be:
      # `nix fmt` is nix's own verb, and nix -- not this flake -- decides which
      # paths the formatter receives, passing the cwd when the user names none.
      # A wrapper that overrode them would break `nix fmt path/to/one/file.nix`,
      # and it cannot tell that "." apart from the default. So `nix fmt` formats
      # where you stand, by design; the `fmt` verb is the anchored one.
      formatter = forAllSystems (pkgs: pkgs.nixfmt-tree);
    };
}
# >>>>> END CANONICAL MACHINERY v1 <<<<<
