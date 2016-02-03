'use strict'

/* @flow */

import {Download} from './download'
import type {Downloader$Job} from './types'

export async function download(options: Downloader$Job): Promise<Download> {
  // TODO: Do all kind of validation here
  return new Download(options)
}
