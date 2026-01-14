import { Component, createSignal, createEffect, For, onCleanup } from "solid-js";
import './App.css';

// Helper to clamp a value between min and max.
const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(value, max));

const App: Component = () => {
  // Base parameters
  const [fps, setFps] = createSignal(24);
  const [frameCount, setFrameCount] = createSignal(100);
  // Tweening parameters
  const [useTweening, setUseTweening] = createSignal(false);
  const [tweenedFrames, setTweenedFrames] = createSignal(0); // allowed range 0-8 initially
  // Playback speed parameter
  const [playbackSpeed, setPlaybackSpeed] = createSignal(1.0);
  
  // Audio and waveform state
  const [audioBuffer, setAudioBuffer] = createSignal<AudioBuffer | null>(null);
  const [waveformData, setWaveformData] = createSignal<Float32Array | null>(null);
  const [audioFile, setAudioFile] = createSignal<File | null>(null);
  const [isPlaying, setIsPlaying] = createSignal(false);
  const [currentTime, setCurrentTime] = createSignal(0);
  const [currentPage, setCurrentPage] = createSignal(0);

  let audioElement: HTMLAudioElement | undefined;
  let playbackAnimationFrameId: number;

  // Compute effective FPS and effective frame count based on tweening settings.
  // Effective FPS is (tweenedFrames + 1) * base FPS when tweening is enabled.
  const effectiveFps = () => useTweening() ? (tweenedFrames() + 1) * fps() : fps();
  const effectiveFrameCount = () =>
    useTweening() ? frameCount() + (frameCount() - 1) * tweenedFrames() : frameCount();

  // Clamp the base FPS between 1 and 60.
  createEffect(() => {
    setFps(clamp(fps(), 1, 60));
  });

  // Adjust tweenedFrames so that (tweenedFrames + 1) * fps ≤ 60.
  createEffect(() => {
    if (useTweening()) {
      const maxTween = Math.max(0, Math.floor(60 / fps()) - 1);
      if (tweenedFrames() > maxTween) {
        setTweenedFrames(maxTween);
      }
    }
  });

  // When playbackSpeed changes, update the audio element's playbackRate.
  createEffect(() => {
    if (audioElement) {
      audioElement.playbackRate = playbackSpeed();
    }
  });

  // Handle file upload and decode audio using AudioContext for waveform.
  const handleFileUpload = (e: Event) => {
    const target = e.currentTarget as HTMLInputElement;
    if (target.files && target.files.length > 0) {
      setAudioFile(target.files[0]);
    }
  };

  createEffect(() => {
    if (audioFile()) {
      const file = audioFile()!;
      const audioURL = URL.createObjectURL(file);
      if (audioElement) {
        audioElement.pause();
      }
      audioElement = new Audio(audioURL);
      audioElement.preload = "auto";
      // Set playbackRate from the playbackSpeed signal.
      audioElement.playbackRate = playbackSpeed();
      audioElement.addEventListener("timeupdate", () => {
        setCurrentTime(audioElement!.currentTime);
      });
      audioElement.addEventListener("ended", () => {
        setIsPlaying(false);
        setCurrentTime(0);
      });

      // Decode audio for waveform display.
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const arrayBuffer = reader.result as ArrayBuffer;
          const audioContext = new AudioContext();
          const buffer = await audioContext.decodeAudioData(arrayBuffer);
          setAudioBuffer(buffer);
          setWaveformData(buffer.getChannelData(0));
        } catch (error) {
          console.error("Error decoding audio:", error);
        }
      };
      reader.readAsArrayBuffer(file);
    }
  });

  // Playback controls.
  const togglePlayback = () => {
    if (!audioElement) return;
    if (isPlaying()) {
      audioElement.pause();
      setIsPlaying(false);
      cancelAnimationFrame(playbackAnimationFrameId);
    } else {
      audioElement.play();
      setIsPlaying(true);
      updatePlayback();
    }
  };

  // Update currentTime using requestAnimationFrame for smooth updates.
  const updatePlayback = () => {
    if (audioElement && isPlaying()) {
      setCurrentTime((prev) => prev + (1 / 60) * playbackSpeed());
      playbackAnimationFrameId = requestAnimationFrame(updatePlayback);
    }
  };

  // Auto page advance: compute the active effective frame and update the page index.
  createEffect(() => {
    const activeFrame = Math.floor(currentTime() * effectiveFps());
    const framesPerPage = columns() * rows();
    const newPage = Math.floor(activeFrame / framesPerPage);
    setCurrentPage(newPage);
  });

  // Handler for seeking audio from a frame click.
  const handleSeek = (seekTime: number) => {
    if (audioElement) {
      audioElement.currentTime = seekTime;
      setCurrentTime(seekTime);
    }
  };

  onCleanup(() => {
    if (audioElement) {
      audioElement.pause();
    }
    cancelAnimationFrame(playbackAnimationFrameId);
  });

  // Pagination settings (columns/rows for the grid).
  const [columns, setColumns] = createSignal(17);
  const [rows, setRows] = createSignal(12);

  const framesPerPage = () => columns() * rows();
  const startFrame = () => currentPage() * framesPerPage();
  const endFrame = () => Math.min(startFrame() + framesPerPage(), effectiveFrameCount());

  return (
    <div style="display: flex; height: 100vh; font-family: sans-serif;">
      {/* Parameters Pane */}
      <div style="width: 300px; overflow-y: auto; padding: 10px; border-right: 1px solid #ddd;">
        <h2>Parameters</h2>
        <div style="margin-bottom: 10px;">
          <label>
            Base FPS (1–60):
            <input
              type="number"
              min="1"
              max="60"
              value={fps()}
              onInput={(e) =>
                setFps(clamp(parseFloat(e.currentTarget.value) || 1, 1, 60))
              }
              style="width: 100%;"
            />
          </label>
        </div>
        <div style="margin-bottom: 10px;">
          <label>
            Real Frame Count:
            <input
              type="number"
              value={frameCount()}
              onInput={(e) => setFrameCount(parseInt(e.currentTarget.value) || 1)}
              style="width: 100%;"
            />
          </label>
        </div>
        {/* Tweening parameters */}
        <div style="margin-bottom: 10px;">
          <label>
            Use Tweening:
            <input
              type="checkbox"
              checked={useTweening()}
              onChange={(e) => setUseTweening(e.currentTarget.checked)}
              style="margin-left: 5px;"
            />
          </label>
        </div>
        {useTweening() && (
          <div style="margin-bottom: 10px;">
            <label>
              Tweened Frames (0–8, auto-adjusted so effective FPS ≤ 60):
              <input
                type="number"
                min="0"
                max="8"
                value={tweenedFrames()}
                onInput={(e) =>
                  setTweenedFrames(clamp(parseInt(e.currentTarget.value) || 0, 0, 8))
                }
                style="width: 100%;"
              />
            </label>
          </div>
        )}
        {/* Playback speed parameter */}
        <div style="margin-bottom: 10px;">
          <label>
            Playback Speed (0.2–3.0):
            <input
              type="number"
              min="0.2"
              max="3.0"
              step="0.1"
              value={playbackSpeed()}
              onInput={(e) =>
                setPlaybackSpeed(parseFloat(e.currentTarget.value) || 1.0)
              }
              style="width: 100%;"
            />
          </label>
        </div>
        <div style="margin-bottom: 10px;">
          <label>
            Upload Audio:
            <input type="file" accept="audio/*" onChange={handleFileUpload} />
          </label>
        </div>
        {audioFile() && (
          <div style="margin-top: 20px;">
            <button onClick={togglePlayback}>
              {isPlaying() ? "Pause" : "Play"}
            </button>
            <div style="margin-top: 10px;">
              Current Time: {currentTime().toFixed(2)}s
            </div>
            <div style="margin-top: 10px;">Page: {currentPage() + 1}</div>
            <div style="margin-top: 10px;">
              Effective FPS: {effectiveFps()} | Total Frames:{" "}
              {effectiveFrameCount()}
            </div>
          </div>
        )}
      </div>

      {/* Frames Pane: Paginated grid */}
      <div
        style={{
          flex: 1,
          padding: "10px",
          display: "grid",
          "grid-template-columns": `repeat(${columns()}, 1fr)`,
          "grid-auto-rows": "auto",
          gap: "10px",
          overflow: "auto",
        }}
      >
        <For
          each={Array.from(
            { length: endFrame() - startFrame() },
            (_, i) => startFrame() + i
          )}
        >
          {(frameIndex) => (
            <Frame
              index={frameIndex}
              effectiveFps={effectiveFps()}
              audioBuffer={audioBuffer()}
              waveformData={waveformData()}
              currentTime={currentTime()}
              onSeek={handleSeek}
              useTweening={useTweening()}
              tweenedFrames={tweenedFrames()}
            />
          )}
        </For>
      </div>
    </div>
  );
};

interface FrameProps {
  index: number;
  effectiveFps: number;
  audioBuffer: AudioBuffer | null;
  waveformData: Float32Array | null;
  currentTime: number;
  onSeek: (time: number) => void;
  useTweening: boolean;
  tweenedFrames: number;
}

const Frame: Component<FrameProps> = (props) => {
  let canvasRef: HTMLCanvasElement | undefined;
  const [hoverX, setHoverX] = createSignal<number | null>(null);
  // Fixed canvas dimensions for a 16:9 ratio (e.g. 320x180)
  const width = 90;
  const height = 45;

  // Determine whether this effective frame is a real frame or a tweened frame.
  const isRealFrame = () => {
    if (!props.useTweening) return true;
    // With tweening enabled, every (tweenedFrames + 1)th frame is a real frame.
    return props.index % (props.tweenedFrames + 1) === 0;
  };

  // Compute seek time when clicking on the canvas.
  const handleClick = (e: MouseEvent) => {
    if (!canvasRef) return;
    const rect = canvasRef.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const fraction = x / width;
    const frameDuration = 1 / props.effectiveFps;
    const seekTime = props.index * frameDuration + fraction * frameDuration;
    props.onSeek(seekTime);
  };

  // Draw waveform, highlight played portion, and vertical hover line.
  createEffect(() => {
    if (canvasRef && props.waveformData && props.audioBuffer) {
      const ctx = canvasRef.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, width, height);

      const startTime = props.index / props.effectiveFps;
      const endTime = (props.index + 1) / props.effectiveFps;
      const sampleRate = props.audioBuffer.sampleRate;
      const startSample = Math.floor(startTime * sampleRate);
      const endSample = Math.floor(endTime * sampleRate);
      const slice = props.waveformData.slice(startSample, endSample);
      const sliceLength = slice.length;

      let playedRatio = 0;
      if (props.currentTime > startTime) {
        playedRatio = Math.min((props.currentTime - startTime) / (endTime - startTime), 1);
      }

      const unplayedColor = "#007acc";
      const playedColor = "#ff6600";

      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let x = 0; x < width; x++) {
        const sampleIndex = Math.floor((x / width) * sliceLength);
        const sampleValue = slice[sampleIndex] || 0;
        const y = ((1 - (sampleValue + 1) / 2) * height);
        if (x === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.strokeStyle = unplayedColor;
      ctx.stroke();

      if (playedRatio > 0) {
        const playedX = playedRatio * width;
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, playedX, height);
        ctx.clip();
        ctx.beginPath();
        for (let x = 0; x < width; x++) {
          const sampleIndex = Math.floor((x / width) * sliceLength);
          const sampleValue = slice[sampleIndex] || 0;
          const y = ((1 - (sampleValue + 1) / 2) * height);
          if (x === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.strokeStyle = playedColor;
        ctx.stroke();
        ctx.restore();
      }

      if (hoverX() !== null) {
        ctx.beginPath();
        ctx.moveTo(hoverX()!, 0);
        ctx.lineTo(hoverX()!, height);
        ctx.strokeStyle = "#33bb33";
        ctx.lineWidth = 4;
        ctx.stroke();
      }
    }
  });

  return (
    <div style="text-align: center;">
      <canvas
        ref={canvasRef!}
        width={width}
        height={height}
        style={{
          // 
          "background-color": isRealFrame() ? "" : "#ff000033",
          border: "1px solid #ccc",
          cursor: "pointer"
        }}
        onMouseMove={(e) => {
          const rect = (e.currentTarget as HTMLCanvasElement).getBoundingClientRect();
          setHoverX(e.clientX - rect.left);
        }}
        onMouseLeave={() => setHoverX(null)}
        onClick={handleClick}
      />
      <div>{props.index + 1}</div>
    </div>
  );
};

export default App;
