import { forwardRef, useEffect, useImperativeHandle, useRef, useState, useCallback } from 'react';
import videojs from 'video.js';
import type Player from 'video.js/dist/types/player';
import 'videojs-contrib-quality-levels';
import 'videojs-hls-quality-selector';
import './videojs-theme.css';

export interface MovieflixPlayerHandle {
  play: () => void;
  pause: () => void;
  seek: (seconds: number) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
}

interface Source {
  src: string;
  type: string;
  label?: string;
}

interface Track {
  src: string;
  srclang: string;
  label: string;
  default?: boolean;
}

interface MovieflixPlayerProps {
  src: string;
  type?: 'auto' | 'mp4' | 'hls' | 'dash' | 'iframe';
  poster?: string;
  autoPlay?: boolean;
  startTime?: number;
  tracks?: Track[];
  className?: string;
  onTimeUpdate?: (time: number) => void;
  onReady?: (duration: number) => void;
  onPause?: () => void;
  onEnded?: () => void;
  onError?: (error: string) => void;
}

function detectSourceType(src: string): string {
  if (src.includes('.m3u8')) return 'application/x-mpegURL';
  if (src.includes('.mpd')) return 'application/dash+xml';
  if (src.includes('.webm')) return 'video/webm';
  return 'video/mp4';
}

function isIframeSource(src: string): boolean {
  return src.includes('youtube.com') || 
         src.includes('youtu.be') || 
         src.includes('vimeo.com') || 
         src.includes('drive.google.com') ||
         src.includes('bunny.net') ||
         src.includes('iframe');
}

export const MovieflixPlayer = forwardRef<MovieflixPlayerHandle, MovieflixPlayerProps>(
  function MovieflixPlayer({
    src,
    type = 'auto',
    poster,
    autoPlay = false,
    startTime = 0,
    tracks = [],
    className = '',
    onTimeUpdate,
    onReady,
    onPause,
    onEnded,
    onError,
  }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const playerRef = useRef<Player | null>(null);
    const [isReady, setIsReady] = useState(false);
    const [hasError, setHasError] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const callbacksRef = useRef({ onTimeUpdate, onReady, onPause, onEnded, onError });
    callbacksRef.current = { onTimeUpdate, onReady, onPause, onEnded, onError };

    const timeUpdateRef = useRef(0);
    const lastTimeUpdateRef = useRef(0);

    const useIframe = type === 'iframe' || isIframeSource(src);

    const getEmbedUrl = useCallback((url: string): string => {
      if (url.includes('youtube.com/watch?v=')) {
        const id = new URL(url).searchParams.get('v');
        return `https://www.youtube.com/embed/${id}?autoplay=1&rel=0&modestbranding=1`;
      }
      if (url.includes('youtu.be/')) {
        const id = url.split('youtu.be/')[1]?.split('?')[0];
        return `https://www.youtube.com/embed/${id}?autoplay=1&rel=0&modestbranding=1`;
      }
      if (url.includes('vimeo.com')) {
        const id = url.split('vimeo.com/')[1]?.split('?')[0];
        return `https://player.vimeo.com/video/${id}?autoplay=1`;
      }
      if (url.includes('drive.google.com')) {
        const match = url.match(/[-\w]{25,}/);
        return match ? `https://drive.google.com/file/d/${match[0]}/preview` : url;
      }
      if (url.includes('bunny.net') || url.includes('iframe')) {
        return url;
      }
      return url;
    }, []);

    useImperativeHandle(ref, () => ({
      play() {
        if (playerRef.current) playerRef.current.play();
      },
      pause() {
        if (playerRef.current) playerRef.current.pause();
      },
      seek(seconds: number) {
        if (playerRef.current) {
          playerRef.current.currentTime(seconds);
        }
      },
      getCurrentTime() {
        return playerRef.current ? playerRef.current.currentTime() : 0;
      },
      getDuration() {
        return playerRef.current ? playerRef.current.duration() : 0;
      },
    }));

    useEffect(() => {
      if (useIframe || !videoRef.current) return;

      const videoType = type === 'auto' ? detectSourceType(src) : 
                       type === 'hls' ? 'application/x-mpegURL' :
                       type === 'dash' ? 'application/dash+xml' :
                       'video/mp4';

      const sources: Source[] = [{
        src: src.trim(),
        type: videoType,
      }];

      const videoTracks = tracks.map(t => ({
        kind: 'subtitles' as const,
        src: t.src,
        srclang: t.srclang,
        label: t.label,
        default: t.default || false,
      }));

      const player = videojs(videoRef.current, {
        html5: {
          vhs: {
            overrideNative: true,
            limitRenditionByPlayerDimensions: true,
            useDevicePixelRatio: true,
            handleManifestRedirects: true,
            maxBufferLength: 30,
            maxMaxBufferLength: 60,
          },
          nativeAudioTracks: false,
          nativeVideoTracks: false,
        },
        controls: true,
        autoplay: autoPlay,
        preload: 'auto',
        fluid: true,
        poster: poster,
        playbackRates: [0.5, 0.75, 1, 1.25, 1.5, 2],
        controlBar: {
          children: [
            'playToggle',
            'skipBackward',
            'skipForward',
            'volumePanel',
            'currentTimeDisplay',
            'timeDivider',
            'durationDisplay',
            'progressControl',
            'liveDisplay',
            'seekToLive',
            'remainingTimeDisplay',
            'customControlSpacer',
            'playbackRateMenuButton',
            'chaptersButton',
            'descriptionsButton',
            'subsCapsButton',
            'audioTrackButton',
            'pictureInPictureToggle',
            'fullscreenToggle',
          ],
          volumePanel: {
            inline: false,
            vertical: true,
          },
        },
        userActions: {
          hotkeys: true,
          doubleClick: true,
        },
        sources,
        tracks: videoTracks,
      }, () => {
        playerRef.current = player;

        if (videoType === 'application/x-mpegURL') {
          try {
            (player as any).hlsQualitySelector({
              displayCurrentQuality: true,
              vjsIconClass: 'vjs-icon-hd',
            });
          } catch (e) {
            console.warn('Quality selector not available', e);
          }
        }

        if (startTime > 0) {
          player.currentTime(startTime);
        }

        setIsReady(true);
        callbacksRef.current.onReady?.(player.duration() || 0);
      });

      player.addClass('vjs-theme-movieflix');
      player.addClass('vjs-big-play-centered');

      const handleTimeUpdate = () => {
        const current = player.currentTime() || 0;
        timeUpdateRef.current = current;
        if (current - lastTimeUpdateRef.current >= 1) {
          lastTimeUpdateRef.current = current;
          callbacksRef.current.onTimeUpdate?.(current);
        }
      };

      const handlePause = () => callbacksRef.current.onPause?.();
      const handleEnded = () => callbacksRef.current.onEnded?.();

      const handleError = () => {
        const error = player.error();
        if (error) {
          const msg = error.message || 'Erro desconhecido no player';
          setErrorMsg(msg);
          setHasError(true);
          callbacksRef.current.onError?.(msg);
        }
      };

      const handleWaiting = () => player.addClass('vjs-waiting-custom');
      const handlePlaying = () => player.removeClass('vjs-waiting-custom');

      player.on('timeupdate', handleTimeUpdate);
      player.on('pause', handlePause);
      player.on('ended', handleEnded);
      player.on('error', handleError);
      player.on('waiting', handleWaiting);
      player.on('playing', handlePlaying);

      const handleKeyDown = (e: KeyboardEvent) => {
        if (!playerRef.current) return;
        const active = document.activeElement;
        if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;

        switch(e.key) {
          case ' ':
          case 'k':
            e.preventDefault();
            playerRef.current.paused() ? playerRef.current.play() : playerRef.current.pause();
            break;
          case 'ArrowRight':
            e.preventDefault();
            playerRef.current.currentTime(playerRef.current.currentTime() + 10);
            break;
          case 'ArrowLeft':
            e.preventDefault();
            playerRef.current.currentTime(playerRef.current.currentTime() - 10);
            break;
          case 'f':
            e.preventDefault();
            if (!playerRef.current.isFullscreen()) {
              playerRef.current.requestFullscreen();
            } else {
              playerRef.current.exitFullscreen();
            }
            break;
          case 'm':
            e.preventDefault();
            playerRef.current.muted(!playerRef.current.muted());
            break;
          case 'ArrowUp':
            e.preventDefault();
            const volUp = Math.min(1, (playerRef.current.volume() || 0) + 0.1);
            playerRef.current.volume(volUp);
            break;
          case 'ArrowDown':
            e.preventDefault();
            const volDown = Math.max(0, (playerRef.current.volume() || 0) - 0.1);
            playerRef.current.volume(volDown);
            break;
        }
      };

      document.addEventListener('keydown', handleKeyDown);

      return () => {
        document.removeEventListener('keydown', handleKeyDown);
        if (playerRef.current) {
          playerRef.current.dispose();
          playerRef.current = null;
        }
      };
    }, [src, useIframe]);

    if (useIframe) {
      const embedUrl = getEmbedUrl(src);
      return (
        <div className={`relative aspect-video w-full overflow-hidden rounded-xl bg-black ${className}`}>
          <iframe
            src={embedUrl}
            className="h-full w-full border-0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            title="Video player"
          />
        </div>
      );
    }

    if (hasError) {
      return (
        <div className={`flex aspect-video w-full items-center justify-center rounded-xl bg-black p-6 text-center ${className}`}>
          <div className="max-w-xl">
            <div className="mb-4 text-5xl">⚠️</div>
            <p className="text-xl font-bold text-white">Não foi possível reproduzir</p>
            <p className="mt-2 text-sm text-zinc-400">{errorMsg}</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 transition"
            >
              Tentar novamente
            </button>
          </div>
        </div>
      );
    }

    return (
      <div 
        ref={containerRef}
        className={`relative aspect-video w-full overflow-hidden rounded-xl bg-black ${className}`}
        data-vjs-player
      >
        <video
          ref={videoRef}
          className="video-js vjs-theme-movieflix vjs-big-play-centered"
          playsInline
        />
        {!isReady && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black">
            <div className="h-12 w-12 animate-spin rounded-full border-4 border-red-600 border-t-transparent" />
          </div>
        )}
      </div>
    );
  }
);

export default MovieflixPlayer;
