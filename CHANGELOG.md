## 2.0.7

- Do not spawn more than 1 worker per 2 MBs
- Reuse first connection instead of disposing it
- Fixed how `should we spawn a new worker?` is determined
- Fixed a bug where events would be fired with invalid number of connections

## 2.0.6

- Fixed parsing of cli param `-H`
- Fixed file size detection for some servers

## 2.0.5

- Bump `range-pool` version to include bugfixes

## 2.0.4

- Change build toolchain from `ucompiler` to `babel-cli`

## 2.0.3

- Correct supportsResume detection
- Fix file name guessing for when download is not resumable

## 2.0.2

- Improve fix from v2.0.1
- Fix support for deflate and gzip content encodings
- Update the progress bar more often (to add a *cool* psychological effect)
- Fix a bug where download would get very slow at the end for large files
- Fix a bug where downloads resumed after restarting the utility would be invalid

## 2.0.1

- Fix a bug where new workers would not be spawned after one finishes it's task

## 2.0.0

- Fix a typo in downloader bin
- Fix support for deflate content encoding
- Internal rewrite feature a lot of stability improvements
- Add support for resuming downloads even after program exits

## 1.1.2

- Workaround a babel bug which rendered this module functionless

## 1.1.1

- Show KiB instead of kb in cli download complete message

## 1.1.0

- Add support for custom headers
- Fix a bug which won't let you download small files
- Allow absolute paths in output path
- Add support for `gzip` and `deflate` content encoding

## 1.0.0

- Initial release after rename from `m-downloader`
