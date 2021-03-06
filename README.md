# Downloader

Downloader is an efficient, multi-connection downloader written in Node.js. By downloading the same file over multiple connections, it can double or triple the speed for high latency users.

## Installation

```
npm install --global sb-downloader
```

## Usage

```
$ download https://www.my-storage-website.com/installer.deb
```
## API

```js
type Downloader$Job = {
  url: string,
  target: {
    directory: string,
    file?: ?string
  },
  connections: number
}
export function download(options: Downloader$Job): Download
export class Download {
  activate(): Promise
  onDidError(callback: Function)
  onDidProgress(callback: Function)
  onDidEstablishConnection(callback: Function)
  onDidComplete(callback: Function)
  dispose()
}
```

## License
This module is licensed under the terms of MIT License. Check the LICENSE file for more info.
