import { defineType, defineField } from 'sanity'

export const about = defineType({
  name: 'about',
  title: 'About Page',
  type: 'document',
  fields: [
    defineField({
      name: 'title',
      title: 'Page Title',
      type: 'string',
      initialValue: 'About Us',
    }),
    defineField({
      name: 'heroImage',
      title: 'Hero / Main Image',
      type: 'image',
      options: { hotspot: true },
    }),
    defineField({
      name: 'content',
      title: 'Page Content',
      type: 'array',
      of: [{ type: 'block' }, { type: 'image' }], // Rich text + inline images
    }),
  ],
})