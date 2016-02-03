'use strict'

/* @flow */

import {Download} from './download'
import type {Downloader$Job} from './types'

export async function download(options: Downloader$Job): Promise<Download> {
  // TODO: Do all kind of validation here
  return new Download(options)
}
process.on('uncaughtError', function(e) {
  console.log(e.stack || e)
})
process.on('uncaughtPromiseRejection', function(e) {
  console.log(e.stack || e)
})
download({
  url: 'http://thewebsmith.co/blog/wp-content/uploads/song',
  target: {
    directory: '/tmp'
  },
  connections: 5
}).then(function(d) {
  d.download().catch(e => console.log(e.stack || e))
}).catch(e => console.log(e.stack || e))
