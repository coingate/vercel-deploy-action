const github = require('@actions/github');
const core = require('@actions/core');
const exec = require('@actions/exec');
const { stripIndents } = require('common-tags');

const commentTrigger = core.getInput('comment-trigger');
const githubToken = core.getInput('github-token');
const vercelToken = core.getInput('vercel-token');
const vercelScope = core.getInput('vercel-scope');
const vercelProjectName = core.getInput('vercel-project-name');
const ref = core.getInput('ref');
const sha = core.getInput('sha');
const commit = core.getInput('commit');

const octokit = new github.GitHub(githubToken);

const { context } = github;

let deploymentUrl;

async function vercelLogs(deployUrl) {
  let myOutput = '';

  const options = {};
  options.listeners = {
    stdout: data => {
      myOutput += data.toString();
      core.info(data.toString());
    },
    stderr: data => {
      core.info(data.toString());
    },
  };

  const args = [
    'vercel',
    'logs',
    deployUrl,
    '-t',
    vercelToken,
    '-o',
    'raw',
    '-n',
    500,
  ];

  if (vercelScope) {
    core.info('using scope');
    args.push('--scope', vercelScope);
  }

  await exec.exec('npx', args, options);

  // eslint-disable-next-line no-console
  console.log(myOutput);

  return myOutput;
}

async function vercelDeploy(deployRef, commitMessage, paramArgs = []) {
  let myOutput = '';

  const options = {};
  options.listeners = {
    stdout: data => {
      myOutput += data.toString();
      core.info(data.toString());
    },
    stderr: data => {
      core.info(data.toString());
    },
  };

  const args = [
    '-t',
    vercelToken,
    '-m',
    `githubCommitSha=${context.sha}`,
    '-m',
    `githubCommitAuthorName=${context.actor}`,
    '-m',
    `githubCommitAuthorLogin=${context.actor}`,
    '-m',
    'githubDeployment=1',
    '-m',
    `githubOrg=${context.repo.owner}`,
    '-m',
    `githubRepo=${context.repo.repo}`,
    '-m',
    `githubCommitOrg=${context.repo.owner}`,
    '-m',
    `githubCommitRepo=${context.repo.repo}`,
    '-m',
    `githubCommitMessage=${commitMessage.trim().substring(0, 42)}`,
    '-m',
    `githubCommitRef=${deployRef}`,
  ];

  if (vercelScope) {
    core.info('using scope');
    args.push('--scope', vercelScope);
  }

  await exec.exec('npx', ['vercel', ...args, ...paramArgs], options);

  return myOutput;
}

async function buildCommentBody(deploymentCommit, deployUrl, success) {
  const url = new URL(deployUrl);
  const buildLogs = await vercelLogs(deployUrl);

  return stripIndents`
    Deploy for _${vercelProjectName}_ ${success ? 'ready' : 'failed'}!

    ✅ Preview
    ${deployUrl}

    📖 Live Logs
    https://app.datadoghq.com/logs?index=*&live=true&query=host%3A${url.host}

    Built with commit ${deploymentCommit}.

    <details>
      <summary>🔧 Build Logs</summary>
      
      \`\`\`console
      ${buildLogs}
      \`\`\`

    </details>
  `;
}

async function createCommentOnPullRequest(
  deploymentCommit,
  deployUrl,
  success,
) {
  const commentBody = await buildCommentBody(
    deploymentCommit,
    deployUrl,
    success,
  );

  await octokit.issues.createComment({
    ...context.repo,
    issue_number: context.payload.issue.number,
    body: commentBody,
  });
}

async function createCommentOnCommit(deploymentCommit, deployUrl, success) {
  const commentBody = buildCommentBody(deploymentCommit, deployUrl, success);

  await octokit.repos.createCommitComment({
    ...context.repo,
    commit_sha: context.sha,
    body: commentBody,
  });
}

async function createComment(success) {
  if (!deploymentUrl) {
    return;
  }

  if (context.eventName === 'issue_comment') {
    core.info('this is related issue or pull_request');
    await createCommentOnPullRequest(sha, deploymentUrl, success);
  } else if (context.eventName === 'push') {
    core.info('this is push event');
    await createCommentOnCommit(sha, deploymentUrl, success);
  }
}

async function run() {
  core.debug(`action : ${context.action}`);
  core.debug(`ref : ${context.ref}`);
  core.debug(`eventName : ${context.eventName}`);
  core.debug(`actor : ${context.actor}`);
  core.debug(`sha : ${context.sha}`);
  core.debug(`workflow : ${context.workflow}`);

  const deployArgs = [];

  if (
    context.eventName === 'issue_comment' &&
    context.payload.comment.body.indexOf(commentTrigger) > -1
  ) {
    core.info('Deploying to staging');
    core.debug(`The provided comment is: ${context.payload.comment.body}`);

    const commentBody = context.payload.comment.body.split(' ');
    const stage = commentBody[commentBody.indexOf(commentTrigger) + 1];

    core.debug(`The provided stage is: ${stage}`);

    deployArgs.push(...['--build-env', `STAGING_ID=${stage}`]);
    deployArgs.push(...['--env', `STAGING_ID=${stage}`]);
  } else if (
    github.context.eventName === 'push' &&
    ref === 'refs/heads/master'
  ) {
    core.info('Deploying to production');

    deployArgs.push('--prod');
  } else {
    // Don't deploy
    return;
  }

  deploymentUrl = await vercelDeploy(ref, commit, deployArgs);

  if (deploymentUrl) {
    core.info('set preview-url output');
    core.setOutput('preview-url', deploymentUrl);
  } else {
    core.warning('get preview-url error');
  }

  await createComment(true);
}

run().catch(async error => {
  await createComment(false);

  core.setFailed(error.message);
});
