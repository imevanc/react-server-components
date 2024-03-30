import http from 'node:http'
import { createRequire } from 'node:module'
import path from 'node:path'
import closeWithGrace from 'close-with-grace'
import compress from 'compression'
import express from 'express'
import { createElement as h, use } from 'react'
import { renderToPipeableStream } from 'react-dom/server'
import { createFromNodeStream } from 'react-server-dom-esm/client'

const moduleBasePath = new URL('../src', import.meta.url).href

const PORT = process.env.PORT || 3000
const RSC_PORT = process.env.RSC_PORT || 3001
const RSC_ORIGIN = new URL(`http://localhost:${RSC_PORT}`)

const app = express()

app.use(compress())

function request(options, body) {
	return new Promise((resolve, reject) => {
		const req = http.request(options, res => {
			resolve(res)
		})
		req.on('error', e => {
			reject(e)
		})
		body.pipe(req)
	})
}

app.head('/', (req, res) => res.status(200).end())

app.use(express.static('public'))
app.use('/js/src', express.static('src'))

// we have to server this file from our own server so dynamic imports are
// relative to our own server (this module is what loads client-side modules!)
app.use('/js/react-server-dom-esm/client', (req, res) => {
	const require = createRequire(import.meta.url)
	const pkgPath = require.resolve('react-server-dom-esm')
	const modulePath = path.join(
		path.dirname(pkgPath),
		'esm',
		'react-server-dom-esm-client.browser.development.js',
	)
	res.sendFile(modulePath)
})

app.all('/:shipId?', async function (req, res) {
	const promiseForData = request(
		{
			host: RSC_ORIGIN.hostname,
			port: RSC_ORIGIN.port,
			method: req.method,
			path: req.url,
			headers: req.headers,
		},
		req,
	)

	if (req.accepts('text/html')) {
		try {
			res.set('Content-type', 'text/html')
			const rscResponse = await promiseForData
			const moduleBaseURL = '/js/src'

			let contentPromise
			function Root() {
				contentPromise ??= createFromNodeStream(
					rscResponse,
					moduleBasePath,
					moduleBaseURL,
				)
				const content = use(contentPromise)
				return content.root
			}
			const { pipe } = renderToPipeableStream(h(Root), {
				bootstrapModules: ['/js/src/index.js'],
				importMap: {
					imports: {
						react:
							'https://esm.sh/react@0.0.0-experimental-2b036d3f1-20240327?pin=v126&dev',
						'react-dom':
							'https://esm.sh/react-dom@0.0.0-experimental-2b036d3f1-20240327?pin=v126&dev',
						'react-dom/':
							'https://esm.sh/react-dom@0.0.0-experimental-2b036d3f1-20240327&pin=v126&dev/',
						'react-error-boundary':
							'https://esm.sh/react-error-boundary@4.0.13?pin=126&dev',
						'react-server-dom-esm/client': '/js/react-server-dom-esm/client',
					},
				},
			})
			pipe(res)
		} catch (e) {
			console.error(`Failed to SSR: ${e.stack}`)
			res.statusCode = 500
			res.end(`Failed to SSR: ${e.stack}`)
		}
	} else {
		try {
			const rscResponse = await promiseForData

			// Forward all headers from the RSC response to the client response
			Object.entries(rscResponse.headers).forEach(([header, value]) => {
				res.set(header, value)
			})

			res.set('Content-type', 'text/x-component')

			rscResponse.on('data', data => {
				res.write(data)
				res.flush()
			})
			rscResponse.on('end', () => {
				res.end()
			})
		} catch (e) {
			console.error(`Failed to proxy request: ${e.stack}`)
			res.statusCode = 500
			res.end(`Failed to proxy request: ${e.stack}`)
		}
	}
})

const server = app.listen(PORT, () => {
	console.log(`✅ SSR: http://localhost:${PORT}`)
})

closeWithGrace(async ({ signal, err }) => {
	if (err) console.error('Shutting down server due to error', err)
	else console.log('Shutting down server due to signal', signal)

	await new Promise((resolve, reject) => {
		server.close(err => {
			if (err) reject(err)
			else resolve()
		})
	})
})