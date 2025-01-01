import {
	createElement as h,
	startTransition,
	Suspense,
	use,
	useDeferredValue,
	useEffect,
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
	const latestNav = useRef(null)
	const [nextLocation, setNextLocation] = useState(getGlobalLocation)
	const [contentPromise, setContentPromise] = useState(initialContentPromise)
	const [isPending, startTransition] = useTransition()

	const location = useDeferredValue(nextLocation)

	// 🐨 add a useEffect here to add a popstate listener
	// 🐨 make a handlePopState function
	//   - create a nextLocation variable set to getGlobalLocation()
	//   - call setNextLocation with that nextLocation
	//   - fetchContent for that nextLocation and set it to fetchPromise
	//   - create a nextContentPromise using createFromFetch(fetchPromise)
	//   - start an transition that sets the contentPromise to nextContentPromise
	// 🐨 add that handlePopState as an event listener to the popstate event on window
	// 🐨 don't forget to remove the event listener in the cleanup!

	useEffect(() => {
		const handlePopState = () => {
			const nextLocation = getGlobalLocation()
			setNextLocation(nextLocation)
			const fetchPromise = fetchContent(nextLocation)
			const nextContentPromise = createFromFetch(fetchPromise)
			startTransition(() => setContentPromise(nextContentPromise))
		}
		window.addEventListener('popstate', handlePopState)
		return () => window.removeEventListener('popstate', handlePopState)
	}, [])

	function navigate(nextLocation, { replace = false } = {}) {
		setNextLocation(nextLocation)
		const thisNav = Symbol(`Nav for ${nextLocation}`)
		latestNav.current = thisNav

		const nextContentPromise = createFromFetch(
			fetchContent(nextLocation).then((response) => {
				if (thisNav !== latestNav.current) return
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
