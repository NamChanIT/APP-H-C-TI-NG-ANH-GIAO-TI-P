class SpeakMateMic extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Float32Array(4096);
    this.length = 0;
  }

  process(inputs) {
    const channel = inputs[0]?.[0];
    if (!channel) return true;
    for (const sample of channel) {
      this.buffer[this.length++] = sample;
      if (this.length === this.buffer.length) {
        this.port.postMessage(this.buffer, [this.buffer.buffer]);
        this.buffer = new Float32Array(4096);
        this.length = 0;
      }
    }
    return true;
  }
}

registerProcessor('speakmate-mic', SpeakMateMic);
