const { getPayload } = require('payload')

module.exports.script = async function script(config) {
  const payload = await getPayload({ config })

  const users = await payload.count({ collection: 'users', overrideAccess: true })
  const media = await payload.count({ collection: 'media', overrideAccess: true })
  const posts = await payload.count({ collection: 'posts', overrideAccess: true })

  console.log(
    JSON.stringify(
      {
        users: users.totalDocs,
        media: media.totalDocs,
        posts: posts.totalDocs,
      },
      null,
      2,
    ),
  )
}

