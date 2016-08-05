/* @flow */

import Download from './download'
import type { DownloadConfig } from './types'

export default function download(options: DownloadConfig): Download {
  return new Download(options)
}

export { download, Download }
