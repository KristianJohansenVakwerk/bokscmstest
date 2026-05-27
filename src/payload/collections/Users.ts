import type { CollectionConfig } from "payload";

export const Users: CollectionConfig = {
  slug: "users",
  auth: true,
  admin: {
    useAsTitle: "email",
  },
  access: {
    read: ({ req }) => Boolean(req.user),
    create: async ({ req }) => {
      const { totalDocs } = await req.payload.count({
        collection: "users",
      });

      if (totalDocs === 0) return true;
      return Boolean(req.user);
    },
    update: ({ req }) => Boolean(req.user),
    delete: ({ req }) => Boolean(req.user),
  },
  fields: [
    {
      name: "displayName",
      type: "text",
    },
  ],
};

