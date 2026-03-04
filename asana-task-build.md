# Asana Task Build

## Context

- Every single call, both internally and per client, is recorded via **Grain**.
- These calls provide clear text details from all parties, including the client and the vendor (us, iExcel).
- Each client has its own Grain "playlist" which is a folder of all the respective calls per client.
- After each client-facing call, there is often (if not always) a private, internal **"intake" call** where our team discusses the details of the prior call.
- During this "intake" call, the iExcel account manager builds specific tickets manually.
- More recently, we have experimented with inputting the Grain call transcript into ChatGPT, to then export specific tasks required of iExcel.
- Even 1 layer deeper, the iExcel account manager has provided ChatGPT with an Asana task template CSV, so that the literal outputs can be an importable CSV.

## Request

Automate the output so that:

1. The call transcript is interpreted, with specific action items (tasks) for the iExcel team members to execute.
2. Build a system that allows for these tasks to be "normalized" into a spreadsheet (or, via API).
3. Use all custom fields where applicable (example: `Client = Total Life`, or `Estimated Hours = 3.5`, etc.)

## Resources

### Prompts Used

#### Description

Place ALL relevant context in these task descriptions — including analyzed history from the summaries above, as well as call transcript individual quotes where applicable. The description tone needs to be conversational, meaning actual full sentences as if you were a Project Manager who is assessing the circumstances and simply summarizing for his executing team members who have no call transcript context whatsoever, except for this specific ticket description.

The description text should be in this format:

> **TASK CONTEXT**
> - Here is where you would write conversational text explaining the reason for the ticket itself. Where applicable, you should include any history or exact quotes based on the transcripts, referencing the exact call date when you use quotes.
>
> **ADDITIONAL CONTEXT**
> - Here is where you would outline any additional context that represents related, external, or historical factors that could affect this specific task.
>
> **REQUIREMENTS**
> - Here is where you would outline any specific requirements to correctly execute the task, including tools required or exact steps required to accomplish the task.

#### Custom Fields

Populate these custom fields we've added to our Asana system, and please use these in your Asana CSV export:

| Field | Value |
|---|---|
| **Client** | `Total Life` |
| **Scrum Stage** | `Backlog` |
| **Estimated Time** | `hh mm` format (hours and minutes) — estimated based on industry best practices |
