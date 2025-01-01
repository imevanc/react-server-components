import {
	createElement as h,
	startTransition,
	Suspense,
	use,
	useDeferredValue,
	useRef,
	useState,
	useTransition,
} from 'react'
import { createRoot } from 'react-dom/client'
import * as RSC from 'react-server-dom-esm/client'
import { ErrorBoundary } from './error-boundary.js'
import { shipFallbackSrc } from './img-utils.js'
import { getGlobalLocation, RouterContext, useLinkHandler } from './router.js'

function fetchContent(location) {
	return fetch(`/rsc${location}`)
}

function createFromFetch(fetchPromise) {
	return RSC.createFromFetch(fetchPromise, {
		moduleBaseURL: `${window.location.origin}/ui`,
	})
}

const initialLocation = getGlobalLocation()
const initialContentPromise = createFromFetch(fetchContent(initialLocation))

function Root() {
	// 🐨 create a latestNav ref here which you can initialize to null if you like
	const latestNav = useRef(null)
	const [nextLocation, setNextLocation] = useState(getGlobalLocation)
	const [contentPromise, setContentPromise] = useState(initialContentPromise)
	const [isPending, startTransition] = useTransition()

	const location = useDeferredValue(nextLocation)

	function navigate(nextLocation, { replace = false } = {}) {
		setNextLocation(nextLocation)
		// 🐨 create a Symbol for this nav (💯 give it a descriptive label for debugging)
		const nav = Symbol('navigate')
		// 🐨 set the latestNav.current to this nav
		latestNav.current = nav

		const nextContentPromise = createFromFetch(
			fetchContent(nextLocation).then((response) => {
				// 🐨 if the latestNav.current is no longer set to this nav, return early
				if (latestNav.current !== nav) return
				if (replace) {
					window.history.replaceState({}, '', nextLocation)
				} else {
					window.history.pushState({}, '', nextLocation)
				}
				return response
			}),
		)

		startTransition(() => setContentPromise(nextContentPromise))
	}

	useLinkHandler(navigate)

	return h(
		RouterContext,
		{
			value: {
				navigate,
				location,
				nextLocation,
				isPending,
			},
		},
		use(contentPromise),
	)
}

startTransition(() => {
	createRoot(document.getElementById('root')).render(
		h(
			'div',
			{ className: 'app-wrapper' },
			h(
				ErrorBoundary,
				{
					fallback: h(
						'div',
						{ className: 'app-error' },
						h('p', null, 'Something went wrong!'),
					),
				},
				h(
					Suspense,
					{
						fallback: h('img', {
							style: { maxWidth: 400 },
							src: shipFallbackSrc,
						}),
					},
					h(Root),
				),
			),
		),
	)
})
