/**
 * ErrorDisplay Component
 *
 * Displays chat errors with type-specific styling, icons, and actionable guidance.
 * Includes special handling for rate limits (countdown timer), bans (reason display),
 * and collapsible technical details.
 */

import { useState, useEffect } from 'react';
import {
  ChatError,
  ChatErrorType,
  isRateLimitedError,
  isBannedError,
  isAuthError,
  isPlatformApiError,
} from '../../lib/types/errors';

interface ErrorDisplayProps {
  error: ChatError;
  onRetry?: () => void;
  onDismiss?: () => void;
  className?: string;
}

export default function ErrorDisplay({ error, onRetry, onDismiss, className = '' }: ErrorDisplayProps) {
  const [showDetails, setShowDetails] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);

  // Handle rate limit countdown
  useEffect(() => {
    if (!isRateLimitedError(error)) return;

    if (error.retryAfter) {
      setCountdown(error.retryAfter);
      const interval = setInterval(() => {
        setCountdown((prev) => {
          if (prev === null || prev <= 1) {
            clearInterval(interval);
            return null;
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(interval);
    } else if (error.resetTime) {
      const resetDate = new Date(error.resetTime);
      const updateCountdown = () => {
        const now = new Date();
        const diff = Math.floor((resetDate.getTime() - now.getTime()) / 1000);
        if (diff <= 0) {
          setCountdown(null);
        } else {
          setCountdown(diff);
        }
      };

      updateCountdown();
      const interval = setInterval(updateCountdown, 1000);
      return () => clearInterval(interval);
    }
  }, [error]);

  // Get styling based on error type
  const getErrorStyle = () => {
    switch (error.type) {
      case ChatErrorType.BANNED:
      case ChatErrorType.PLATFORM_API_ERROR:
      case ChatErrorType.UNKNOWN_ERROR:
        return {
          bg: 'bg-red-50',
          border: 'border-red-200',
          text: 'text-red-800',
          icon: '🚫',
        };

      case ChatErrorType.TOKEN_EXPIRED:
      case ChatErrorType.UNAUTHORIZED:
      case ChatErrorType.STREAMER_OFFLINE:
        return {
          bg: 'bg-orange-50',
          border: 'border-orange-200',
          text: 'text-orange-800',
          icon: '⚠️',
        };

      case ChatErrorType.RATE_LIMITED:
        return {
          bg: 'bg-yellow-50',
          border: 'border-yellow-200',
          text: 'text-yellow-800',
          icon: '⏱️',
        };

      case ChatErrorType.NETWORK_ERROR:
      case ChatErrorType.VALIDATION_ERROR:
        return {
          bg: 'bg-gray-50',
          border: 'border-gray-200',
          text: 'text-gray-800',
          icon: '⚠️',
        };

      default:
        return {
          bg: 'bg-gray-50',
          border: 'border-gray-200',
          text: 'text-gray-800',
          icon: '❌',
        };
    }
  };

  const style = getErrorStyle();

  // Determine if retry button should be shown
  const canRetry =
    error.type === ChatErrorType.NETWORK_ERROR ||
    error.type === ChatErrorType.PLATFORM_API_ERROR ||
    error.type === ChatErrorType.UNKNOWN_ERROR ||
    (isRateLimitedError(error) && countdown === null);

  return (
    <div className={`rounded-lg border p-3 ${style.bg} ${style.border} ${className}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 flex-1">
          <span className="text-lg flex-shrink-0" role="img" aria-label="Error icon">
            {style.icon}
          </span>
          <div className="flex-1 min-w-0">
            <h3 className={`font-semibold text-sm ${style.text} mb-1`}>
              {error.userMessage}
            </h3>

            {/* Rate limit countdown */}
            {isRateLimitedError(error) && countdown !== null && (
              <p className={`text-xs ${style.text} mb-2`}>
                You can send another message in <strong>{formatCountdown(countdown)}</strong>
              </p>
            )}

            {/* Ban reason */}
            {isBannedError(error) && error.reason && (
              <p className={`text-xs ${style.text} mb-2`}>
                <strong>Reason:</strong> {error.reason}
              </p>
            )}

            {/* Ban expiration */}
            {isBannedError(error) && error.expiresAt && (
              <p className={`text-xs ${style.text} mb-2`}>
                <strong>Expires:</strong> {new Date(error.expiresAt).toLocaleString()}
              </p>
            )}

            {/* Platform message */}
            {isPlatformApiError(error) && error.platformMessage && (
              <p className={`text-xs ${style.text} mb-2 italic`}>
                Platform message: {error.platformMessage}
              </p>
            )}

            {/* Actionable steps */}
            {error.actionableSteps.length > 0 && (
              <div className="mt-2">
                <p className={`text-xs font-medium ${style.text} mb-1`}>What you can do:</p>
                <ul className={`text-xs ${style.text} list-disc list-inside space-y-0.5`}>
                  {error.actionableSteps.map((step, index) => (
                    <li key={index}>{step}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Action buttons */}
            <div className="mt-2 flex gap-2">
              {canRetry && onRetry && (
                <button
                  onClick={onRetry}
                  className={`px-2 py-1 text-xs font-medium rounded ${style.text} hover:opacity-80 border ${style.border}`}
                  disabled={countdown !== null}
                >
                  Try Again
                </button>
              )}

              {/* Re-auth button for auth errors */}
              {isAuthError(error) && error.platform && (
                <a
                  href={`${window.location.origin}/api/v1/auth/viewer/${error.platform}/login`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`px-2 py-1 text-xs font-medium rounded ${style.text} hover:opacity-80 border ${style.border}`}
                >
                  Sign in with {capitalizeFirst(error.platform)}
                </a>
              )}

              {/* Technical details toggle */}
              {error.technicalDetails && (
                <button
                  onClick={() => setShowDetails(!showDetails)}
                  className={`px-2 py-1 text-xs font-medium rounded ${style.text} hover:opacity-80 border ${style.border}`}
                >
                  {showDetails ? 'Hide' : 'Show'} Details
                </button>
              )}
            </div>

            {/* Technical details (collapsible) */}
            {showDetails && error.technicalDetails && (
              <div className="mt-2 p-2 bg-black/10 rounded text-xs font-mono overflow-x-auto">
                <pre className={style.text}>{error.technicalDetails}</pre>
              </div>
            )}
          </div>
        </div>

        {/* Dismiss button */}
        {onDismiss && (
          <button
            onClick={onDismiss}
            className={`text-lg ${style.text} hover:opacity-70 flex-shrink-0 leading-none`}
            aria-label="Dismiss error"
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Format countdown in MM:SS format
 */
function formatCountdown(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Capitalize first letter
 */
function capitalizeFirst(str: string): string {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}
