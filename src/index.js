'use strict'

/* @flow */

import {Download} from './download'
import type {Downloader$Job} from './types'

export function download(options: Downloader$Job): Download {
  return new Download(options)
}
