'use strict'

/* @flow */

import {CompositeDisposable, Emitter} from 'sb-event-kit'
import type {Downloader$Job} from './types'

export class Download {
  subscriptions: CompositeDisposable;
  options: Downloader$Job;

  constructor(options: Downloader$Job) {
    this.subscriptions = new CompositeDisposable()
    this.options = options
  }
  start() {
    
  }
  dispose() {
    this.subscriptions.dispose()
  }
}
