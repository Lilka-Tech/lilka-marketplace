import { readFile } from 'node:fs/promises';

const token = process.env.LILKA_MARKETPLACE_APP_TOKEN;
const expectedHeadOid = process.env.GITHUB_SHA;
if (!token) throw new Error('LILKA_MARKETPLACE_APP_TOKEN is required');
if (!expectedHeadOid) throw new Error('GITHUB_SHA is required');

const additions = await Promise.all(
  ['metadata/root.json', 'metadata/snapshot.json', 'metadata/timestamp.json'].map(async (path) => ({
    path,
    contents: (await readFile(path)).toString('base64'),
  })),
);

const query = `
  mutation PublishMarketplaceMetadata($input: CreateCommitOnBranchInput!) {
    createCommitOnBranch(input: $input) {
      commit { oid url }
    }
  }
`;
const response = await fetch('https://api.github.com/graphql', {
  method: 'POST',
  headers: {
    accept: 'application/vnd.github+json',
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
    'user-agent': 'lilka-marketplace-publisher',
    'x-github-api-version': '2022-11-28',
  },
  body: JSON.stringify({
    query,
    variables: {
      input: {
        branch: {
          repositoryNameWithOwner: 'Lilka-Tech/lilka-marketplace',
          branchName: 'main',
        },
        expectedHeadOid,
        message: { headline: 'chore(catalog): publish signed metadata' },
        fileChanges: { additions },
      },
    },
  }),
});
const body = await response.json();
if (!response.ok || body.errors?.length) {
  throw new Error(`GitHub publication failed: ${JSON.stringify(body.errors ?? body)}`);
}
console.log(`Published ${body.data.createCommitOnBranch.commit.oid}`);
