# AI Tone Auditor Core

AI Tone Auditor is a specialized diagnostic tool designed to help users identify and remediate the "Karen" persona often found in default LLM outputs (Gemini, Claude, Llama, etc.). It provides deep semantic analysis to ensure your AI interactions are professional, clear, and free from bureaucratic condescension.

## Core Intent

Many Large Language Models (LLMs) default to a personality that can come across as overly formal, evasive, or "Karen-like"—characterized by passive-aggressive helpfulness, bureaucratic jargon, and a lack of genuine empathy. 

The core intent of this tool is to:
1. **Detect Default Bias**: Identify when an LLM is slipping into its default, overly robotic or quietly condescending personality.
2. **Prevent the "Karen" Persona**: Flag specific phrases and tones that contribute to a negative user experience.
3. **Customize AI Personality**: Provide actionable feedback and prompt snippets to help users tune their AI's personality to be more authentic and effective.
4. **RLHF-inspired feedback**: Offer specific strategies to "un-learn" negative patterns through better custom instructions and prompt engineering.

## Examples of "Karen" Patterns

The auditor specifically looks for these common bureaucratic and passive-aggressive triggers:

- **"As an AI language model..."**: The ultimate accountability shield. Used to evade direct answers while maintaining a lecturing, superior tone.
- **"I'm sorry you feel that way."**: The classic "Non-Apology Apology." It shifts the focus to the user's emotions to avoid taking responsibility for the AI's own confusing or incorrect output.
- **"Let's take a step back."**: A common tone-policing tactic. Used to halt a challenging discussion by implying the user is being too aggressive or "unprofessional."

## Key Features

- **Semantic Deep Scan**: Analyzes text for subtle tone shifts and bureaucratic patterns.
- **Trigger Word Analysis**: Detects specific phrases from our "Karen/Gaslight" dictionary.
- **Contextual Heatmap**: Visualizes areas of low context or evasive language.
- **Universal Custom Instructions**: Generates a list of specific, actionable instructions that can be added to any LLM's system prompt or custom instructions field.
- **RLHF-inspired feedback**: Provides "Reinforcement Learning from Human Feedback" style suggestions for immediate prompt improvement.

## Getting Started

1. Paste your AI's response into the auditor.
2. Run the audit to see the Tone Distribution Profile.
3. Review the "Anti-Karen Remediation Strategy" and "Universal Custom Instructions".
4. Copy the suggested instructions to tune your AI's system prompt.

## Run and deploy your AI Studio app

This application is built as an AI Studio applet. To run it locally or deploy it, follow these steps:

### Prerequisites

- Node.js (v18 or later)
- npm or yarn

### Local Development

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Set up environment variables**:
   Create a `.env` file in the root directory and add your Gemini API key:
   ```env
   GEMINI_API_KEY=your_api_key_here
   ```

3. **Start the development server**:
   ```bash
   npm run dev
   ```
   The app will be available at `http://localhost:3000`.

### Deployment

AI Studio apps are designed to be deployed seamlessly within the AI Studio environment. To share your app:

1. Ensure all changes are committed.
2. Use the **Share** button in the AI Studio interface to generate a public URL.
3. Your app will be hosted on a `.run.app` subdomain, ready for use by others.

## Tech Stack

- **Frontend**: React, Tailwind CSS, Framer Motion
- **AI Engine**: Gemini 3.1 Flash
- **Visualizations**: Recharts
- **Icons**: Lucide React

---
*Built to make AI interactions more human, one audit at a time.*
