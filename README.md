# Vercel Deploy Action

Deploys build to Vercel to specific stage.

## Example Usage

```
- name: Deploy Step
  uses: coingate/vercel-deploy-action@master
  with:
    comment-trigger: "/preview"
    github-token: ${{ secrets.GITHUB_TOKEN }}
    vercel-token: ${{ secrets.VERCEL_TOKEN }}
    vercel-scope: evil-company
    vercel-project-name: hello-world
    ref: ${{ steps.event-data.outputs.ref }}
    sha: ${{ steps.event-data.outputs.sha }}
    commit: ${{ steps.event-data.outputs.commit }}
```