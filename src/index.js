/* @flow */

import Download from './download'
import type { Downloader$Job } from './types'

export default function download(options: Downloader$Job): Download {
  return new Download(options)
}

export { download, Download }
