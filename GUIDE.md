# Sauce Command Center — User Guide

**URL**: https://mc.saucecreative.co
**What it is**: A dashboard for managing your OpenClaw AI agent. Think of it as mission control for your AI — you can chat with it, assign tasks, monitor sessions, track costs, and configure how it works.

Each user has their own agent, sessions, tasks, and data. Nothing is shared between users.

---

## Logging In

1. Go to https://mc.saucecreative.co
2. Enter your email and password
3. First thing you should do: go to **Settings** and change your password from the default

---

## Pages

### Dashboard
Your home screen. Shows at a glance:
- **Agent status** — is your AI agent online, what model it's running
- **Active sessions** — how many conversations are open
- **Memory stats** — how many files/chunks your agent has in memory
- **Channels** — which communication channels are connected (Slack, WhatsApp, Discord, etc.)
- **Recent activity** — latest actions your agent has taken
- **Heartbeat** — when the agent last checked in

### Conversations
All your agent's chat sessions in one place.

- **Session list** — see all active and past sessions, filter by active/all, search by name
- **Session history** — click any session to read the full conversation transcript
- **Continue a conversation** — type a message at the bottom of any session to continue it
- **New Chat** — click the blue "New Chat" button to start a fresh conversation with your agent (uses the same brain/memory as all other sessions)
- **Close sessions** — click the X on any session to close it

### Workshop
A task board (kanban-style) for assigning work to your agent.

- **Add Task** — create a task with a title, description, priority (low/medium/high), and tags
- **Execute** — click "Execute" on any queued task to have your agent work on it as a sub-agent
- **View Report** — once done, click the task to see the agent's full report
- **Discuss** — after a task completes, click "Discuss" to open the chat widget with the report pre-loaded so you can talk through next steps
- **Re-run** — re-execute a completed task if you want fresh results

### Cost Tracker
Monitor your AI usage and spending.

- **Token usage** — daily breakdown of how many tokens your agent has used
- **By session type** — see which channels (Discord, web, sub-agents) are using the most tokens
- **Budget** — if a budget is configured, see how close you are to the limit

### Cron Monitor
View scheduled jobs your agent runs automatically.

- **Cron list** — see all configured cron jobs, their schedules, and last run times
- **Status** — whether each job succeeded or failed on its last run

### Scout
*(If enabled)* An automated opportunity finder.

- **Scan results** — the agent periodically searches the web for opportunities matching your configured queries
- **Deploy to Workshop** — send any interesting finding to the Workshop as a task for deeper research

### Agent Hub
See your agent roster and session activity.

- **Primary agent** — your main AI agent, its model, status, and token usage
- **Custom agents** — create specialized sub-agents with specific models and system prompts
- **Session breakdown** — see all sessions grouped by type (main, Discord, web, sub-agent)

### Skills
Manage your agent's installed skills (plugins).

- **Installed skills** — see what capabilities your agent has
- **Skill details** — view description and configuration for each skill

### Settings
System configuration and account management.

- **Change Password** — update your login password (do this first!)
- **Model Routing** — see which AI model is set as primary and what fallbacks are configured
- **OpenClaw Configuration** — gateway port, memory path, skills path
- **Heartbeat Status** — live heartbeat data (interval, last run, status)
- **System Information** — MC version, OpenClaw version, Node.js version, uptime
- **Export/Import** — backup or restore your configuration
- **Roadmap** — shared roadmap document (editable)

### AWS
*(If enabled)* AWS services dashboard.

- **Account overview** — AWS account ID, region, credits remaining
- **Services** — status of connected AWS services
- **Bedrock Models** — browse all available AI models on AWS Bedrock, filtered by category
- **Use as Agent** — switch your agent's model to any Bedrock text model
- **Generate Image** — create images using Bedrock image models (Nova Canvas, Titan)
- **Gallery** — view previously generated images

---

## Chat Widget

The blue chat bubble in the bottom-right corner is always available on every page. It's a quick way to message your agent without leaving what you're doing. Same brain, same memory as the full Conversations page.

---

## Tips

- **Everything is per-user** — your sessions, tasks, costs, and agent config are completely separate from other users
- **Your agent name** — appears throughout the dashboard, pulled from your OpenClaw workspace config
- **Auto-refresh** — most pages refresh data automatically every few seconds
- **Mobile friendly** — the dashboard works on phones and tablets
- **Keyboard shortcuts** — in chat, press Enter to send, Shift+Enter for a new line
