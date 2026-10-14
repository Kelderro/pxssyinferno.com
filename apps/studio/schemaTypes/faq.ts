import { defineType, defineField } from 'sanity'

export const faq = defineType({
  name: 'faq',
  title: 'FAQ Page',
  type: 'document',
  fields: [
    defineField({
      name: 'questions',
      title: 'Questions & Answers',
      type: 'array',
      of: [
        {
          type: 'object',
          name: 'faqItem',
          title: 'FAQ Item',
          fields: [
            defineField({
              name: 'question',
              title: 'Question',
              type: 'string',
              validation: (Rule) => Rule.required(),
            }),
            defineField({
              name: 'answer',
              title: 'Answer',
              type: 'array',
              of: [{ type: 'block' }], // Rich text so you can add links or bold text
              validation: (Rule) => Rule.required(),
            }),
          ],
          preview: {
            select: {
              title: 'question',
            },
          },
        },
      ],
    }),
  ],
  // Add this preview block to control the document's header view
  preview: {
    prepare() {
      return {
        title: 'FAQ Page',
      }
    },
  },
})