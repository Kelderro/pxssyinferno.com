/**
 * Seed the standard made-to-order option template onto custom products.
 *
 * Run from your own terminal (it needs network access to Sanity):
 *
 *   # dry run — shows what WOULD change, writes nothing:
 *   SANITY_WRITE_TOKEN=xxxx node studio/scripts/seed-custom-options.mjs
 *
 *   # apply to custom products that have NO options yet:
 *   SANITY_WRITE_TOKEN=xxxx node studio/scripts/seed-custom-options.mjs --apply
 *
 *   # also overwrite products that already have options (e.g. the "Hello" placeholder):
 *   SANITY_WRITE_TOKEN=xxxx node studio/scripts/seed-custom-options.mjs --apply --force
 *
 * Create the token at manage.sanity.io -> your project -> API -> Tokens (Editor role).
 * The token stays in your shell; it is never committed.
 */

const PROJECT_ID = process.env.SANITY_PROJECT_ID || 'whp8gyuq'
const DATASET = process.env.SANITY_DATASET || 'production'
const API = process.env.SANITY_API_VERSION || '2026-03-01'
const TOKEN = process.env.SANITY_WRITE_TOKEN

const APPLY = process.argv.includes('--apply')
const FORCE = process.argv.includes('--force')

// Edit the € amounts / choices here to taste before running.
const TEMPLATE = [
  {
    _type: 'optionGroup', _key: 'fabric', label: 'Fabric / Material', required: true, showSwatches: false,
    choices: [
      { _type: 'choice', _key: 'faux', label: 'Faux Leather', priceDelta: 20 },
      { _type: 'choice', _key: 'real', label: 'Real Leather', priceDelta: 80 },
      { _type: 'choice', _key: 'denim', label: 'Denim', priceDelta: 20 },
      { _type: 'choice', _key: 'own', label: 'I have my own jacket', priceDelta: 0 },
    ],
  },
  {
    _type: 'optionGroup', _key: 'colour', label: 'Jacket Colour', required: true, showSwatches: true,
    choices: [
      { _type: 'choice', _key: 'red', label: 'Red', priceDelta: 20, swatchColor: '#b00000' },
      { _type: 'choice', _key: 'black', label: 'Black', priceDelta: 0, swatchColor: '#000000' },
      { _type: 'choice', _key: 'grey', label: 'Grey', priceDelta: 0, swatchColor: '#808080' },
    ],
  },
  {
    _type: 'optionGroup', _key: 'fit', label: 'Fit', required: true, showSwatches: false,
    choices: [
      { _type: 'choice', _key: 'cropped', label: 'Cropped', priceDelta: 0 },
      { _type: 'choice', _key: 'fitted', label: 'Fitted', priceDelta: 0 },
      { _type: 'choice', _key: 'standard', label: 'Standard', priceDelta: 0 },
      { _type: 'choice', _key: 'oversized', label: 'Oversized', priceDelta: 0 },
      { _type: 'choice', _key: 'decidelater', label: 'Decide Later', priceDelta: 0 },
    ],
  },
  {
    _type: 'optionGroup', _key: 'size', label: 'Size', required: true, showSwatches: false,
    choices: [
      { _type: 'choice', _key: 'xs', label: 'XS', priceDelta: 0 },
      { _type: 'choice', _key: 's', label: 'S', priceDelta: 0 },
      { _type: 'choice', _key: 'm', label: 'M', priceDelta: 0 },
      { _type: 'choice', _key: 'l', label: 'L', priceDelta: 0 },
      { _type: 'choice', _key: 'xl', label: 'XL', priceDelta: 0 },
      { _type: 'choice', _key: 'other', label: 'Other', priceDelta: 0 },
    ],
  },
  {
    _type: 'optionGroup', _key: 'studs', label: 'Studs', required: true, showSwatches: false,
    choices: [
      { _type: 'choice', _key: 'studs-yes', label: 'Yes', priceDelta: 5 },
      { _type: 'choice', _key: 'studs-no', label: 'No', priceDelta: 0 },
    ],
  },
]

const base = `https://${PROJECT_ID}.api.sanity.io/v${API}`

async function query(groq) {
  const res = await fetch(`${base}/data/query/${DATASET}?query=${encodeURIComponent(groq)}`)
  if (!res.ok) throw new Error(`Query failed: ${res.status} ${await res.text()}`)
  return (await res.json()).result
}

async function mutate(mutations) {
  const res = await fetch(`${base}/data/mutate/${DATASET}?returnIds=true`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ mutations }),
  })
  if (!res.ok) throw new Error(`Mutate failed: ${res.status} ${await res.text()}`)
  return res.json()
}

const run = async () => {
  const products = await query(
    `*[_type == "product" && isReadyToShip == false]{ _id, title, "count": count(customOptions) }`
  )
  if (!products.length) {
    console.log('No made-to-order products found (isReadyToShip == false).')
    return
  }

  const targets = products.filter((p) => FORCE || !p.count)
  const skipped = products.filter((p) => !FORCE && p.count)

  console.log(`Made-to-order products: ${products.length}`)
  skipped.forEach((p) => console.log(`  SKIP  ${p.title} (already has ${p.count} option group(s); use --force to overwrite)`))
  targets.forEach((p) => console.log(`  SEED  ${p.title}`))

  if (!targets.length) {
    console.log('\nNothing to do.')
    return
  }
  if (!APPLY) {
    console.log('\nDry run. Re-run with --apply to write these changes.')
    return
  }
  if (!TOKEN) {
    console.error('\nSANITY_WRITE_TOKEN is required to apply. Aborting.')
    process.exit(1)
  }

  const mutations = targets.map((p) => ({ patch: { id: p._id, set: { customOptions: TEMPLATE } } }))
  const result = await mutate(mutations)
  console.log(`\nApplied. Patched ${result.results?.length ?? mutations.length} document(s).`)
}

run().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
