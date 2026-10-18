import { defineType, defineField } from 'sanity'

export const product = defineType({
  name: 'product',
  title: 'Products',
  type: 'document',
  fields: [
    defineField({
      name: 'title',
      title: 'Product Name',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'slug',
      title: 'Slug (URL path)',
      type: 'slug',
      options: { source: 'title', maxLength: 96 },
      validation: (Rule) => Rule.required(),
    }),

    // --- PRICING & DISCOUNTS ---
    defineField({
      name: 'price',
      title: 'Regular Price (€)',
      type: 'number',
      description: 'For made-to-order pieces this is the "From" / starting price.',
      validation: (Rule) => Rule.required().positive(),
    }),
    defineField({
      name: 'salePrice',
      title: 'Sale / Discounted Price (€)',
      type: 'number',
      description: 'Leave empty if the product is not on sale.',
      validation: (Rule) =>
        Rule.custom((salePrice, context) => {
          const doc = context.document as any
          if (salePrice && doc?.price && salePrice >= doc.price) {
            return 'Sale price must be lower than regular price.'
          }
          return true
        }),
    }),
    defineField({
      name: 'saleStartDate',
      title: 'Sale Start Date & Time',
      type: 'datetime',
      description: 'When should the discount activate? Leave empty to start immediately.',
    }),
    defineField({
      name: 'saleEndDate',
      title: 'Sale End Date & Time',
      type: 'datetime',
      description: 'When should the discount expire? Leave empty for no end date.',
      validation: (Rule) =>
        Rule.custom((endDate, context) => {
          const doc = context.document as any
          if (endDate && doc?.saleStartDate && new Date(endDate) <= new Date(doc.saleStartDate)) {
            return 'Sale end date must be after the start date.'
          }
          return true
        }),
    }),

    // --- APPAREL DETAILS ---
    defineField({
      name: 'category',
      title: 'Category',
      type: 'string',
      options: {
        list: [
          { title: 'Jackets', value: 'jackets' },
          { title: 'Home', value: 'home' },
          { title: 'T-Shirts', value: 't-shirts' },
          { title: 'Skirts & Shorts', value: 'skirts-shorts' },
          { title: 'Bags & Totes', value: 'bags' },
          { title: 'Accessories', value: 'accessories' },
        ],
      },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'isReadyToShip',
      title: 'Ready to Ship?',
      type: 'boolean',
      initialValue: true,
      description:
        'ON = an in-stock piece customers buy and pay for online. ' +
        'OFF = a made-to-order / custom piece: customers configure options and submit a request for a quote (no online payment).',
    }),
    defineField({
      name: 'variants',
      title: 'Product Variants (Color, Size & Stock)',
      type: 'array',
      description: 'Used for Ready-to-Ship pieces. Sizes and sold-out status are derived from these variants.',
      of: [
        {
          type: 'object',
          name: 'variant',
          title: 'Variant',
          fields: [
            {
              name: 'color',
              title: 'Color Name (e.g. Black, Blood Red, Bone)',
              type: 'string',
            },
            {
              name: 'swatchColor',
              title: 'Swatch Colour (hex, e.g. #8b0000)',
              type: 'string',
              description:
                'Optional. The colour shown as the on-site swatch dot. Only needs to be set on one ' +
                'variant row per colour. If left empty the site guesses from the colour name.',
            },
            {
              name: 'size',
              title: 'Size Name (e.g. S, M, L, XL)',
              type: 'string',
            },
            {
              name: 'price',
              title: 'Price for this variant (€)',
              type: 'number',
              description:
                'Optional. If set, this exact colour/size combination is sold at this price ' +
                '(e.g. larger sizes cost more). Leave empty to use the product price above.',
              validation: (Rule) => Rule.positive(),
            },
            {
              name: 'stock',
              title: 'Stock Quantity',
              type: 'number',
              initialValue: 1,
            },
          ],
          preview: {
            select: {
              color: 'color',
              size: 'size',
              stock: 'stock',
              price: 'price',
            },
            prepare({ color, size, stock, price }) {
              return {
                title: `${color ?? 'Default'} / Size: ${size ?? 'OS'}`,
                subtitle: `${price ? '€' + price + ' · ' : ''}Stock: ${stock ?? 0}`,
              }
            },
          },
        },
      ],
    }),

    // --- MADE-TO-ORDER / CUSTOM CONFIGURATION ---
    defineField({
      name: 'customOptions',
      title: 'Custom Options (Made-to-Order configurator)',
      type: 'array',
      description:
        'Only used when "Ready to Ship" is OFF. Each group becomes a dropdown on the request form ' +
        '(e.g. Fabric, Colour, Fit, Size, Studs). Choices can add to the starting price as an estimate.',
      initialValue: [
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
      ],
      of: [
        {
          type: 'object',
          name: 'optionGroup',
          title: 'Option Group',
          fields: [
            {
              name: 'label',
              title: 'Option Label (e.g. Fabric / Material)',
              type: 'string',
              validation: (Rule) => Rule.required(),
            },
            {
              name: 'required',
              title: 'Required?',
              type: 'boolean',
              initialValue: true,
            },
            {
              name: 'showSwatches',
              title: 'Show colour swatches?',
              type: 'boolean',
              initialValue: false,
              description: 'If on, each choice renders as a colour swatch using its Swatch Colour below.',
            },
            {
              name: 'choices',
              title: 'Choices',
              type: 'array',
              of: [
                {
                  type: 'object',
                  name: 'choice',
                  title: 'Choice',
                  fields: [
                    {
                      name: 'label',
                      title: 'Choice Label (e.g. Real Leather)',
                      type: 'string',
                      validation: (Rule) => Rule.required(),
                    },
                    {
                      name: 'priceDelta',
                      title: 'Added Price (€)',
                      type: 'number',
                      initialValue: 0,
                      description: 'Amount this choice adds to the starting price. Use 0 for no change.',
                    },
                    {
                      name: 'swatchColor',
                      title: 'Swatch Colour (hex, e.g. #8b0000)',
                      type: 'string',
                      description: 'Optional. Only used when "Show colour swatches" is on.',
                    },
                  ],
                  preview: {
                    select: { label: 'label', priceDelta: 'priceDelta' },
                    prepare({ label, priceDelta }) {
                      return {
                        title: label || 'Choice',
                        subtitle: priceDelta ? `+ €${priceDelta}` : 'No added cost',
                      }
                    },
                  },
                },
              ],
            },
          ],
          preview: {
            select: { label: 'label', choices: 'choices' },
            prepare({ label, choices }) {
              const count = Array.isArray(choices) ? choices.length : 0
              return {
                title: label || 'Option Group',
                subtitle: `${count} choice${count === 1 ? '' : 's'}`,
              }
            },
          },
        },
      ],
    }),

    defineField({
      name: 'images',
      title: 'Product Gallery',
      type: 'array',
      of: [{ type: 'image', options: { hotspot: true } }],
    }),
    defineField({
      name: 'description',
      title: 'Description (Materials, Fit, Care Instructions)',
      type: 'array',
      of: [{ type: 'block' }],
    }),
    defineField({
      name: 'stock',
      title: 'Stock Quantity (fallback when no variants)',
      type: 'number',
      initialValue: 1,
      description: 'Used only for Ready-to-Ship pieces that have no variants.',
    }),
  ],

  preview: {
    select: {
      title: 'title',
      media: 'images.0',
      isReadyToShip: 'isReadyToShip',
      price: 'price',
    },
    prepare({ title, media, isReadyToShip, price }) {
      return {
        title: title || 'Untitled product',
        subtitle: `${isReadyToShip === false ? 'Made to order · from ' : ''}€${price ?? '—'}`,
        media,
      }
    },
  },
})
