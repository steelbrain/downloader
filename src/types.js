'use strict'

/* @flow */

export type Downloader$Job = {
  url: string,
  target: {
    directory: string,
    file?: ?string
  },
  connections: number
}
