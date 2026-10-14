import { defineType, defineField } from 'sanity'

export const terms = defineType({
  name: 'terms',
  title: 'Terms & Conditions',
  type: 'document',
  fields: [
    defineField({
      name: 'lastUpdated',
      title: 'Last Updated Date',
      type: 'date',
      options: {
        dateFormat: 'YYYY-MM-DD',
      },
    }),
    defineField({
      name: 'content',
      title: 'Terms Content',
      type: 'array',
      of: [
        {
          type: 'block',
          styles: [
            { title: 'Normal', value: 'normal' },
            { title: 'H2', value: 'h2' },
            { title: 'H3', value: 'h3' },
          ],
          lists: [
            { title: 'Bullet', value: 'bullet' },
            { title: 'Numbered', value: 'number' },
          ],
        },
      ],
      validation: (Rule) => Rule.required(),
    }),
  ],
  preview: {
    prepare() {
      return {
        title: 'Terms & Conditions',
      }
    },
  },
})