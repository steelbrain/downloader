/* @flow */

import invariant from 'assert'
import { RangePool } from 'range-pool'
import { CompositeDisposable, Emitter } from 'sb-event-kit'

import * as Helpers from './helpers'
import type { DownloadConfig } from './types'

class Download {
  pool: RangePool;
  emitter: Emitter;
  options: DownloadConfig;
  subscriptions: CompositeDisposable;
  constructor(options: DownloadConfig) {
    this.pool = new RangePool(Infinity)
    this.emitter = new Emitter()
    this.options = Helpers.fillOptions(options)
    this.subscriptions = new CompositeDisposable()

    this.subscriptions.add(this.emitter)
    this.pool.setMetadata({
      lastChunkId: 0,
    })
  }
  async activate(): Promise<void> {
    const filenameIsTemporary = !this.options.output.file
    const filename = filenameIsTemporary ? `download-${Helpers.getRandomString()}` : this.options.output.file
    invariant(filename)
  }
  dispose() {
    // TODO: Save state here
    this.subscriptions.dispose()
  }
}

function download(config: DownloadConfig): Download {
  return new Download(config)
}

export { Download, download }
export default download
