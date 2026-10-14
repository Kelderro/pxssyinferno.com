import {defineConfig} from 'sanity'
import {structureTool} from 'sanity/structure'
import {visionTool} from '@sanity/vision'
import {schemaTypes} from './schemaTypes'

// 1. Define all singleton document names here
const singletonTypes = new Set(['about','faq','terms'])
const singletonActions = new Set(['publish', 'discardChanges', 'restore'])

export default defineConfig({
  name: 'default',
  title: 'PxssyInferno',

  projectId: 'whp8gyuq',
  dataset: 'production',

  plugins: [
    structureTool({
      structure: (S) =>
        S.list()
          .title('Content')
          .items([
            // Automatically lists ALL schema document types EXCEPT singletons
            ...S.documentTypeListItems().filter(
              (listItem) => !singletonTypes.has(listItem.getId() || '')
            ),

            S.divider(),

            // 2. Singleton pages
            S.listItem()
              .title('FAQ Page')
              .id('faqPage')
              .child(S.document().schemaType('faq').documentId('faqPage')),

            S.listItem()
              .title('About Page')
              .id('aboutPage')
              .child(S.document().schemaType('about').documentId('aboutPage')),

            S.listItem()
              .title('Terms & Conditions')
              .id('termsPage')
              .child(S.document().schemaType('terms').documentId('termsPage')),
          ]),
    }),
    visionTool(),
  ],

  schema: {
    types: schemaTypes,
    // Hide singletons from the top-right '+' New Document creation button
    templates: (templates) =>
      templates.filter(({ schemaType }) => !singletonTypes.has(schemaType)),
  },

  document: {
    // Prevent deletion/duplication of singletons
    actions: (input, context) =>
      singletonTypes.has(context.schemaType)
        ? input.filter(({ action }) => action && singletonActions.has(action))
        : input,
  },
})
