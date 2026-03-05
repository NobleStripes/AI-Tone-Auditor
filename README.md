# AI Tone Auditor Core

AI Tone Auditor is a specialized diagnostic tool designed to help users identify and remediate the "Karen" persona often found in default LLM outputs. It provides deep semantic analysis to ensure your AI interactions are professional, clear, and free from bureaucratic condescension.

## Core Intent

Many Large Language Models (LLMs) default to a personality that can come across as overly formal, evasive, or "Karen-like"—characterized by passive-aggressive helpfulness, bureaucratic jargon, and a lack of genuine empathy. 

The core intent of this tool is to:
1. **Detect Default Bias**: Identify when an LLM is slipping into its default, often robotic or condescending, personality.
2. **Prevent the "Karen" Persona**: Flag specific phrases and tones that contribute to a negative user experience.
3. **Customize AI Personality**: Provide actionable feedback and prompt snippets to help users tune their AI's personality to be more authentic and effective.
4. **Remediate with RLHF Logic**: Offer specific strategies to "un-learn" negative patterns through better custom instructions and prompt engineering.

## Key Features

- **Semantic Deep Scan**: Analyzes text for subtle tone shifts and bureaucratic patterns.
- **Trigger Word Analysis**: Detects specific phrases from our "Karen/Gaslight" dictionary.
- **Contextual Heatmap**: Visualizes areas of low context or evasive language.
- **Personalization Profile**: Generates a custom remediation strategy to fix your AI's specific personality flaws.
- **RLHF-Ready Feedback**: Provides "Reinforcement Learning from Human Feedback" style suggestions for immediate prompt improvement.

## Getting Started

1. Paste your AI's response into the auditor.
2. Run the audit to see the Tone Distribution Profile.
3. Review the "Anti-Karen Remediation Strategy" in the Personalization Profile.
4. Copy the suggested prompt snippets to tune your AI's custom instructions.

## Tech Stack

- **Frontend**: React, Tailwind CSS, Framer Motion
- **AI Engine**: Gemini 3.1 Flash
- **Visualizations**: Recharts
- **Icons**: Lucide React

---
*Built to make AI interactions more human, one audit at a time.*
