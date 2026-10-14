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
      description: 'When should the discount activate?',
    }),
    defineField({
      name: 'saleEndDate',
      title: 'Sale End Date & Time',
      type: 'datetime',
      description: 'When should the discount expire?',
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
          { title: 'T-Shirts', value: 't-shirts' },
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
      description: 'Uncheck if this is a custom made-to-order piece.',
    }),
    defineField({
      name: 'variants',
      title: 'Product Variants (Color, Size & Stock)',
      type: 'array',
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
              name: 'size',
              title: 'Size Name (e.g. S, M, L, XL)',
              type: 'string',
            },
            {
              name: 'stock',
              title: 'Stock Quantity',
              type: 'number',
              initialValue: 1,
            }
          ],
          preview: {
            select: {
              color: 'color',
              size: 'size',
              stock: 'stock',
            },
            prepare({ color, size, stock }) {
              return {
                title: `${color ?? 'Default'} / Size: ${size ?? 'OS'}`,
                subtitle: `Stock: ${stock ?? 0}`,
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
      title: 'Stock Quantity',
      type: 'number',
      initialValue: 1,
    }),
  ],
})