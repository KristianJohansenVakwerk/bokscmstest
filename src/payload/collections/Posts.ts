import type { CollectionConfig } from "payload";

export const Posts: CollectionConfig = {
  slug: "posts",
  admin: {
    useAsTitle: "title",
    defaultColumns: ["title", "slug", "createdAt"],
  },
  access: {
    read: () => true,
    create: ({ req }) => Boolean(req.user),
    update: ({ req }) => Boolean(req.user),
    delete: ({ req }) => Boolean(req.user),
  },
  fields: [
    {
      name: "title",
      type: "text",
      required: true,
    },
    {
      name: "slug",
      type: "text",
      required: true,
      unique: true,
      index: true,
    },
    {
      name: "content",
      type: "textarea",
    },
    {
      name: "image",
      type: "upload",
      relationTo: "media",
    },
    {
      name: "dropbox",
      type: "group",
      fields: [
        {
          name: "pathLower",
          type: "text",
          unique: true,
          index: true,
          admin: {
            position: "sidebar",
            readOnly: true,
          },
        },
        {
          name: "id",
          type: "text",
          admin: {
            position: "sidebar",
            readOnly: true,
          },
        },
        {
          name: "rev",
          type: "text",
          admin: {
            position: "sidebar",
            readOnly: true,
          },
        },
      ],
    },
  ],
  timestamps: true,
};

