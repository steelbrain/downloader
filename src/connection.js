/* @flow */

import { CompositeDisposable, Emitter } from 'sb-event-kit'
import type { DownloadConfig } from './types'

export default class Connection {
  worker: Object;
  emitter: Emitter;
  options: DownloadConfig;
  subscriptions: CompositeDisposable;
  constructor(worker: Object, options: DownloadConfig) {
    this.worker = worker
    this.emitter = new Emitter()
    this.options = options
    this.subscriptions = new CompositeDisposable()

    this.subscriptions.add(this.emitter)
  }
  async activate(): Promise<void> {

  }
  async rename(filePath: string): Promise<void> {

  }
  dispose() {
    this.subscriptions.dispose()
  }
}
