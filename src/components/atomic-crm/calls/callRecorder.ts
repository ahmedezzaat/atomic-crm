// Records both sides of a call as one audio file in the host's browser: the
// host's microphone and the other person's audio are mixed with the Web Audio
// API. Audio only, mono-ish low bitrate, so an hour is roughly 11 MB.
const MIME_TYPES = [
  { mime: "audio/webm;codecs=opus", extension: "webm" },
  { mime: "audio/mp4", extension: "m4a" },
];

export class CallRecorder {
  private context = new AudioContext();
  private destination = this.context.createMediaStreamDestination();
  private recorder?: MediaRecorder;
  private chunks: Blob[] = [];
  private extension = "webm";

  addTrack(track: MediaStreamTrack) {
    this.context
      .createMediaStreamSource(new MediaStream([track]))
      .connect(this.destination);
  }

  start() {
    const type = MIME_TYPES.find((t) => MediaRecorder.isTypeSupported(t.mime));
    if (!type) throw new Error("This browser cannot record audio");
    this.extension = type.extension;
    this.recorder = new MediaRecorder(this.destination.stream, {
      mimeType: type.mime,
      audioBitsPerSecond: 24000,
    });
    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    // a chunk every 10 s, so little is lost if the page is closed abruptly
    this.recorder.start(10000);
  }

  get active() {
    return this.recorder?.state === "recording";
  }

  async stop(): Promise<{ blob: Blob; extension: string } | null> {
    const recorder = this.recorder;
    if (!recorder || recorder.state === "inactive") {
      await this.context.close();
      return this.chunks.length ? this.result(recorder?.mimeType) : null;
    }
    await new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
      recorder.stop();
    });
    await this.context.close();
    return this.chunks.length ? this.result(recorder.mimeType) : null;
  }

  private result(mime?: string) {
    return {
      blob: new Blob(this.chunks, { type: mime || "audio/webm" }),
      extension: this.extension,
    };
  }
}
