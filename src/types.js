/* @flow */

export type DownloadConfig = {
  url: string,
  output: {
    file?: string,
    directory: string,
  },
  headers: Object,
  connections: number
}
