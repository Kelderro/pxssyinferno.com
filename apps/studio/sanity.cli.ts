import {defineCliConfig} from 'sanity/cli'

export default defineCliConfig({
  api: {
    projectId: 'whp8gyuq',
    dataset: 'production'
  },
  deployment: {
    appId: 'zk5vz4liymk0jfnvsd96d4ef',
    /**
     * Enable auto-updates for studios.
     * Learn more at https://www.sanity.io/docs/studio/latest-version-of-sanity#k47faf43faf56
     */
    autoUpdates: true,
  },
})
