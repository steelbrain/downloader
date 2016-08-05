/* @flow */

import type RangePool from 'range-pool'

export type DownloadConfig = {
  url: string,
  output: string | {
    file?: string,
    directory: string,
  },
  headers?: Object,
  connections?: number
}

export type DownloadJob = {
  url: string,
  range: ?RangePool,
  output: {
    file: ?string,
    directory: string,
  },
  headers: Object,
  connections: number,
}
