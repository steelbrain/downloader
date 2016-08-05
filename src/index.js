/* @flow */

import Download from './download'
import type { Downloader$Job } from './types'

function download(options: Downloader$Job): Download {
  return new Download(options)
}

module.exports = download
module.exports.Download = Download
