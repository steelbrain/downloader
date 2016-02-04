'use strict'

/* @flow */

import {Emitter, CompositeDisposable} from 'sb-event-kit'
import type {Disposable} from 'sb-event-kit'
import type {Downloader$Job} from './types'

export class Download {
  options: Downloader$Job;
  subscriptions: CompositeDisposable;
  emitter: Emitter;

  constructor(options: Downloader$Job) {
    this.subscriptions = new CompositeDisposable()
    this.emitter = new Emitter()
    this.options = options
  }
  onDidError(callback: ((error: Error) => void)): Disposable {
    return this.emitter.on('did-error', callback)
  }
  onDidProgress(callback: Function): Disposable {
    return this.emitter.on('did-progress', callback)
  }
  onDidStart(callback: ((fileSize: number, filePath: string, url: string) => void)): Disposable {
    return this.emitter.on('did-start', callback)
  }
  onDidComplete(callback: Function): Disposable {
    return this.emitter.on('did-complete', callback)
  }
  dispose() {
    this.subscriptions.dispose()
  }
}
