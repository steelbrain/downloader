/* @flow */

import * as Helpers from './helpers'
import type { DownloadConfig } from './types'

class Download {
  options: DownloadConfig;
  constructor(options: DownloadConfig) {
    this.options = Helpers.fillOptions(options)
  }
}

function download(config: DownloadConfig): Download {
  return new Download(config)
}

export { Download, download }
export default download
