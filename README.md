# 0x-swap-server
Run multiple (minimal) swap/quote endpoints for A-B testing different versions of asset-swapper.

## Setup
You need to side-load two (or more) versions of asset-swapper by using package aliasing and (possibly) yarn `resolutions`. See the `package.json` for my setup. You will need to modify it for your environment.

You might also need to modify `src/start.js` to manually add/modify an endpoint for your AS package.

## Running
```bash
NODE_RPC=YOUR_NODE_HTTP_RPC yarn start
```
