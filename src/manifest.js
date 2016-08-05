/* @flow */

import RangePool from 'range-pool'
import { exists, unlink, readFile, writeFile } from './helpers'

type ManifestStruct = {
  url: string,
  pool: RangePool,
  fileSize: number,
}

export default class Manifest {
  url: string;
  path: string;
  data: ManifestStruct;
  filePath: string;
  fileSize: number;

  constructor(url: string, filePath: string, manifestPath: string, fileSize: number) {
    this.url = url
    this.path = manifestPath
    this.data = {
      url: this.url,
      pool: new RangePool(fileSize),
      fileSize: this.fileSize,
    }
    this.filePath = filePath
    this.fileSize = fileSize
  }
  async read() {
    try {
      await exists(this.path)
    } catch (_) {
      await this.write()
      return
    }
    let parsed
    try {
      parsed = JSON.parse((await readFile(this.path)).toString())
    } catch (_) {
      /* Invalid JSON, ignore */
    }
    if (parsed) {
      this.data.pool = RangePool.unserialize(parsed.pool)
    }
  }
  async write() {
    await writeFile(this.path, JSON.stringify({
      url: this.url,
      pool: this.data.pool.serialize(),
      fileSize: this.fileSize,
    }))
  }
  async delete() {
    await unlink(this.path)
  }
  static async create(url: string, filePath: string, fileSize: number) {
    const manifest = new Manifest(url, filePath, `${filePath}.dl.json`, fileSize)
    await manifest.read()
    return manifest
  }
}
