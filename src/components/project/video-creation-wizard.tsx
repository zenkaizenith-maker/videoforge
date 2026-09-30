"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/form-fields";
import { ProgressBar } from "@/components/ui/feedback";
import type { DashboardProject } from "@/lib/db/dashboard-projects";

export interface WizardProjectConfig {
  title: string;
  topic: string;
  audience: string;
  customAudience?: string;
  videoType: string;
  duration: number; // in seconds: 30, 60, 180, 300
  visualStyle: string;
  voiceStyle: string;
  aspectRatio: "16:9" | "9:16" | "1:1";
}

interface VideoCreationWizardProps {
  onClose?: () => void;
  onSuccess?: (project: DashboardProject) => void;
  isStandalonePage?: boolean;
}

const STEPS = [
  { id: 1, title: "Topic" },
  { id: 2, title: "Audience" },
  { id: 3, title: "Type" },
  { id: 4, title: "Duration" },
  { id: 5, title: "Style" },
  { id: 6, title: "Voice" },
  { id: 7, title: "Ratio" },
  { id: 8, title: "Generate" },
];

const QUICK_TOPICS = [
  "Why Deep Focus Is Your Modern Superpower",
  "The Psychology of Small Daily Habits",
  "How the World’s Deepest Oceans Were Explored",
  "The Hidden Science Behind High Energy",
  "A Brief History of Everyday Rituals",
];

const AUDIENCES = [
  {
    id: "General Public",
    title: "General Public",
    desc: "Curious, casual viewers seeking entertaining, relatable knowledge with immediate hooks.",
    icon: "🌍",
  },
  {
    id: "Students & Learners",
    title: "Students & Learners",
    desc: "Structured breakdowns, clear conceptual models, and accessible diagrams.",
    icon: "🎓",
  },
  {
    id: "Professionals & Founders",
    title: "Professionals & Founders",
    desc: "Actionable strategies, industry data, high-efficiency systems and insights.",
    icon: "💼",
  },
  {
    id: "Mindfulness & Wellness",
    title: "Mindfulness & Wellness",
    desc: "Calm, introspective, reflective pacing focused on well-being and personal growth.",
    icon: "🌿",
  },
  {
    id: "Tech & Futurism",
    title: "Tech & Futurism",
    desc: "Forward-thinking enthusiasts interested in AI, engineering, and frontier science.",
    icon: "⚡",
  },
  {
    id: "Custom",
    title: "Custom Audience",
    desc: "Define your own niche target audience persona for specialized messaging.",
    icon: "🎯",
  },
];

const VIDEO_TYPES = [
  {
    id: "Explainer / Video Essay",
    title: "Explainer / Video Essay",
    desc: "Deep-dive inquiry into how and why things work with fluid chapter transitions.",
    icon: "💡",
  },
  {
    id: "Story / Narrative",
    title: "Story / Narrative",
    desc: "Dramatic narrative arc with evocative tension, character beats, and resolution.",
    icon: "📖",
  },
  {
    id: "Top 5 / Listicle",
    title: "Top 5 / Listicle",
    desc: "High-retention, punchy countdown structure with clear chapter cards.",
    icon: "🔢",
  },
  {
    id: "Documentary Mini",
    title: "Documentary Mini",
    desc: "Cinematic realism, historical or scientific context, and journalistic pacing.",
    icon: "🎞️",
  },
  {
    id: "Short-Form Hook",
    title: "Short-Form Hook",
    desc: "Fast, energetic storytelling engineered for quick loops and maximum retention.",
    icon: "🔥",
  },
  {
    id: "Motivation & Philosophy",
    title: "Motivation & Philosophy",
    desc: "Inspiring visual metaphors, resonant aphorisms, and reflective pauses.",
    icon: "✨",
  },
];

const DURATIONS = [
  {
    seconds: 30,
    label: "30 Seconds",
    words: "~65 – 75 words",
    bestFor: "TikTok, YouTube Shorts, Instagram Reels teasers",
    icon: "⚡",
  },
  {
    seconds: 60,
    label: "60 Seconds (1 Min)",
    words: "~130 – 150 words",
    bestFor: "Standard social explainer, high viral retention",
    icon: "⏱️",
  },
  {
    seconds: 180,
    label: "3 Minutes",
    words: "~390 – 450 words",
    bestFor: "Standard YouTube explainer, multi-scene arc",
    icon: "🎬",
  },
  {
    seconds: 300,
    label: "5 Minutes",
    words: "~680 – 750 words",
    bestFor: "Comprehensive mini-documentary or full essay",
    icon: "📽️",
  },
];

const VISUAL_STYLES = [
  {
    id: "Editorial",
    title: "Editorial",
    desc: "Clean typography, subtle film texture, muted color palettes, contemporary magazine feel.",
    badge: "Modern & Sleek",
  },
  {
    id: "Documentary",
    title: "Documentary",
    desc: "Archival photography, warm sepia undertones, vintage lens distortion, timeless aura.",
    badge: "Cinematic Classic",
  },
  {
    id: "Minimal",
    title: "Minimal",
    desc: "Bold monochrome contrast, generous negative space, crisp geometric visual geometry.",
    badge: "Stark & Pure",
  },
  {
    id: "Bold Motion",
    title: "Bold Motion",
    desc: "High energy kinetic text, vibrant chromatic accents, dynamic cutaways.",
    badge: "Punchy & Viral",
  },
  {
    id: "Cinematic Dark",
    title: "Cinematic Dark",
    desc: "Moody atmospheric chiaroscuro, deep obsidian tones, dramatic anamorphic bokeh.",
    badge: "Moody & Dramatic",
  },
  {
    id: "Cyberpunk / Neon",
    title: "Cyberpunk / Neon",
    desc: "Electric indigo and cyan hues, dark tech aesthetic, synthesized geometric overlays.",
    badge: "Futuristic Glow",
  },
];

const VOICES = [
  {
    id: "Warm Narrator",
    title: "Warm Narrator",
    desc: "Deep, welcoming, conversational cadence that invites trust and comfort.",
    tone: "Intimate & Grounded",
  },
  {
    id: "Clear Explainer",
    title: "Clear Explainer",
    desc: "Crisp articulation, measured pacing, authoritative yet approachable.",
    tone: "Professional & Precise",
  },
  {
    id: "Calm Storyteller",
    title: "Calm Storyteller",
    desc: "Soft, mindful delivery with gentle inflections suited for reflective essays.",
    tone: "Serene & Meditative",
  },
  {
    id: "Dynamic Creator",
    title: "Dynamic Creator",
    desc: "Uptempo, enthusiastic, engaging delivery designed to maintain high energy.",
    tone: "Energetic & Punchy",
  },
  {
    id: "No Narration",
    title: "No Narration",
    desc: "Ambient background score focus with dynamic typographic on-screen titles.",
    tone: "Instrumental Focus",
  },
];

const ASPECT_RATIOS = [
  {
    id: "16:9" as const,
    title: "Landscape · 16:9",
    dimensions: "1920 × 1080",
    desc: "Standard widescreen display for YouTube, Vimeo, desktop browsers, and TVs.",
    cssClass: "ratio-16-9",
  },
  {
    id: "9:16" as const,
    title: "Vertical · 9:16",
    dimensions: "1080 × 1920",
    desc: "Full-screen vertical video for TikTok, YouTube Shorts, and Instagram Reels.",
    cssClass: "ratio-9-16",
  },
  {
    id: "1:1" as const,
    title: "Square · 1:1",
    dimensions: "1080 × 1080",
    desc: "Balanced square frame optimized for Instagram grid and LinkedIn feeds.",
    cssClass: "ratio-1-1",
  },
];

export function VideoCreationWizard({
  onClose,
  onSuccess,
  isStandalonePage = false,
}: VideoCreationWizardProps) {
  const router = useRouter();

  // Wizard State
  const [currentStep, setCurrentStep] = useState(1);
  const [validationError, setValidationError] = useState("");

  // Configuration fields
  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("");
  const [audience, setAudience] = useState("General Public");
  const [customAudience, setCustomAudience] = useState("");
  const [videoType, setVideoType] = useState("Explainer / Video Essay");
  const [duration, setDuration] = useState(60);
  const [visualStyle, setVisualStyle] = useState("Editorial");
  const [voiceStyle, setVoiceStyle] = useState("Warm Narrator");
  const [aspectRatio, setAspectRatio] = useState<"16:9" | "9:16" | "1:1">("16:9");

  // Generation & Progress State
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [generationStage, setGenerationStage] = useState(0);
  const [generationMessage, setGenerationMessage] = useState("");

  const PROGRESS_STAGES = [
    "Verifying creator workspace & profile...",
    "Storing creative configuration in project settings...",
    "Structuring narrative beats & scene outline...",
    "Queuing production render job...",
    "Video project ready!",
  ];

  // Validation function for advancing between steps
  function validateStep(step: number): boolean {
    setValidationError("");
    if (step === 1) {
      if (!title.trim()) {
        setValidationError("Please enter a title for your video project.");
        return false;
      }
      if (!topic.trim()) {
        setValidationError("Please provide a core topic or idea description.");
        return false;
      }
      if (topic.trim().length < 5) {
        setValidationError("Please describe your topic in at least 5 characters.");
        return false;
      }
    }
    if (step === 2) {
      if (audience === "Custom" && !customAudience.trim()) {
        setValidationError("Please specify your custom audience description.");
        return false;
      }
    }
    if (step === 3 && !videoType) {
      setValidationError("Please select a video format type.");
      return false;
    }
    if (step === 4 && !duration) {
      setValidationError("Please select a video duration.");
      return false;
    }
    if (step === 5 && !visualStyle) {
      setValidationError("Please select a visual style.");
      return false;
    }
    if (step === 6 && !voiceStyle) {
      setValidationError("Please select a narration voice style.");
      return false;
    }
    if (step === 7 && !aspectRatio) {
      setValidationError("Please choose an aspect ratio.");
      return false;
    }
    return true;
  }

  function handleNext() {
    if (validateStep(currentStep)) {
      if (currentStep < 8) {
        setCurrentStep((prev) => prev + 1);
      } else {
        handleGenerate();
      }
    }
  }

  function handleBack() {
    setValidationError("");
    if (currentStep > 1) {
      setCurrentStep((prev) => prev - 1);
    }
  }

  // Final Project Generation Handler
  async function handleGenerate() {
    setIsGenerating(true);
    setValidationError("");
    setGenerationProgress(15);
    setGenerationStage(0);
    setGenerationMessage(PROGRESS_STAGES[0]);

    try {
      const client = createClient();
      const {
        data: { user },
      } = await client.auth.getUser();

      if (!user) {
        setIsGenerating(false);
        setValidationError("Your session has expired. Please sign in again.");
        return;
      }

      // Stage 1: Ensure Profile Row Exists
      const profileName =
        user.user_metadata?.display_name || user.email?.split("@")[0] || "Creator";
      await client
        .from("profiles")
        .upsert({ id: user.id, display_name: profileName }, { onConflict: "id" });

      setGenerationProgress(35);
      setGenerationStage(1);
      setGenerationMessage(PROGRESS_STAGES[1]);

      // Stage 2: Create Project Record
      const audienceSummary = audience === "Custom" ? customAudience : audience;
      const enrichedTopic = `${topic.trim()} [Format: ${videoType} | Audience: ${audienceSummary}]`;

      const { data: project, error: projectError } = await client
        .from("projects")
        .insert({
          owner_id: user.id,
          title: title.trim(),
          topic: enrichedTopic,
          status: "draft",
        })
        .select()
        .single();

      if (projectError || !project) {
        throw new Error(projectError?.message || "Failed to create project record.");
      }

      // Store in project_settings
      const now = new Date().toISOString();
      const { error: settingsError } = await client.from("project_settings").insert({
        project_id: project.id,
        aspect_ratio: aspectRatio,
        target_duration_seconds: duration,
        visual_style: visualStyle,
        voice_style: voiceStyle,
        updated_at: now,
      });

      if (settingsError) {
        console.warn("Settings storage warning:", settingsError.message);
      }

      setGenerationProgress(65);
      setGenerationStage(2);
      setGenerationMessage(PROGRESS_STAGES[2]);

      // Stage 3: Initial Script Outline
      const initialScriptContent = `# ${title}\n\n**Topic:** ${topic}\n**Audience:** ${audienceSummary}\n**Style:** ${visualStyle} | **Voice:** ${voiceStyle} | **Target Duration:** ${duration}s\n\n### Scene 1 — The Hook (00:00 - 00:${Math.min(
        15,
        Math.floor(duration * 0.25)
      ).toString().padStart(2, "0")})\nOpening visual and compelling statement introducing ${topic}.\n\n### Scene 2 — The Core Shift\nDeep exploration tailored for ${audienceSummary}.\n\n### Scene 3 — Resolution & Impact\nKey takeaways and memorable closing beat.`;

      await client.from("scripts").insert({
        project_id: project.id,
        content: initialScriptContent,
        version: 1,
      });

      setGenerationProgress(85);
      setGenerationStage(3);
      setGenerationMessage(PROGRESS_STAGES[3]);

      // Stage 4: Queued Render Job
      await client.from("render_jobs").insert({
        project_id: project.id,
        status: "queued",
        progress: 10,
        current_step: "Queued for script analysis & media rendering",
      });

      setGenerationProgress(100);
      setGenerationStage(4);
      setGenerationMessage(PROGRESS_STAGES[4]);

      const createdDashboardProject: DashboardProject = {
        id: project.id,
        title: project.title,
        topic: project.topic,
        status: project.status,
        createdAt: project.created_at,
        updatedAt: project.updated_at,
        settings: {
          aspectRatio,
          durationSeconds: duration,
          visualStyle,
          voiceStyle,
        },
        render: {
          status: "queued",
          progress: 10,
        },
      };

      // Allow 800ms to appreciate completed screen
      setTimeout(() => {
        if (onSuccess) {
          onSuccess(createdDashboardProject);
        } else {
          router.push(`/projects/${project.id}/script`);
          router.refresh();
        }
      }, 900);
    } catch (err) {
      setIsGenerating(false);
      const msg = err instanceof Error ? err.message : "Something went wrong creating your video.";
      setValidationError(msg);
    }
  }

  // PROGRESS SCREEN (When generation is active)
  if (isGenerating) {
    return (
      <div className="wizard-progress-screen">
        <div className="wizard-pulse-beacon" aria-hidden="true">
          🎬
        </div>
        <h2>Creating Your Video Workspace</h2>
        <p className="subtle" style={{ maxWidth: "440px", margin: "8px auto 20px" }}>
          {generationMessage}
        </p>

        <div style={{ maxWidth: "420px", margin: "0 auto" }}>
          <ProgressBar value={generationProgress} label="Video creation progress" />
          <div style={{ marginTop: "8px", fontSize: "12px", color: "var(--muted)" }}>
            {generationProgress}% complete
          </div>
        </div>

        <div className="wizard-progress-steps">
          {PROGRESS_STAGES.map((text, idx) => {
            const isDone = generationStage > idx;
            const isCurrent = generationStage === idx;
            return (
              <div
                key={text}
                className={`wizard-progress-step-item ${isDone ? "done" : isCurrent ? "active" : ""}`}
              >
                <span>{isDone ? "✓" : isCurrent ? "▶" : "○"}</span>
                <span>{text}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className={isStandalonePage ? "wizard-standalone" : "wizard-container"}>
      {/* Wizard Header */}
      <div className="metric-row" style={{ alignItems: "flex-start" }}>
        <div>
          <div className="eyebrow">Creative Studio Wizard</div>
          <h1 style={{ margin: "4px 0 0", fontSize: "22px" }}>
            {currentStep === 1 && "Step 1: What is this video about?"}
            {currentStep === 2 && "Step 2: Who is your target audience?"}
            {currentStep === 3 && "Step 3: Choose your video format"}
            {currentStep === 4 && "Step 4: Select target duration"}
            {currentStep === 5 && "Step 5: Pick a visual aesthetic"}
            {currentStep === 6 && "Step 6: Choose your narration voice"}
            {currentStep === 7 && "Step 7: Choose the aspect ratio"}
            {currentStep === 8 && "Step 8: Review & Generate"}
          </h1>
          <p className="subtle" style={{ margin: "4px 0 0", fontSize: "13px" }}>
            {currentStep === 1 && "Give your project a name and describe the core topic or story concept."}
            {currentStep === 2 && "Tailor tone, complexity, and vocabulary to who will be watching."}
            {currentStep === 3 && "Determine the pacing and narrative structure of the content."}
            {currentStep === 4 && "Set expected duration to optimize script word count and scene count."}
            {currentStep === 5 && "Define color palette, typography style, and visual imagery direction."}
            {currentStep === 6 && "Select the vocal energy and character of the AI voice narration."}
            {currentStep === 7 && "Select the output frame dimensions for your target destination."}
            {currentStep === 8 && "Confirm your creative direction and launch production generation."}
          </p>
        </div>

        {onClose && (
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close wizard">
            ✕
          </Button>
        )}
      </div>

      {/* Stepper Navigation Indicator */}
      <nav className="wizard-stepper" aria-label="Wizard progress">
        {STEPS.map((s) => {
          const isActive = s.id === currentStep;
          const isCompleted = s.id < currentStep;
          return (
            <button
              key={s.id}
              type="button"
              className={`wizard-step-item ${isActive ? "active" : isCompleted ? "completed" : ""}`}
              onClick={() => {
                if (s.id < currentStep || validateStep(currentStep)) {
                  setCurrentStep(s.id);
                }
              }}
              title={`Go to ${s.title}`}
            >
              <span className="wizard-step-num">{isCompleted ? "✓" : s.id}</span>
              <span>{s.title}</span>
            </button>
          );
        })}
      </nav>

      {validationError && (
        <div className="vf-alert danger" role="alert" style={{ marginBottom: "14px" }}>
          <span>⚠️</span>
          <span>{validationError}</span>
        </div>
      )}

      {/* STEP 1: TOPIC */}
      {currentStep === 1 && (
        <div className="wizard-step-content">
          <Field label="Project Name / Video Title">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. The Psychology of Flow State"
              required
            />
          </Field>

          <div style={{ marginTop: "16px" }}>
            <Field label="Topic & Story Concept">
              <Textarea
                rows={4}
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="Describe the main idea, narrative arc, or key lesson you want to convey in this video..."
                required
              />
            </Field>
          </div>

          <div style={{ marginTop: "14px" }}>
            <span className="subtle" style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase" }}>
              Quick Idea Starters
            </span>
            <div className="quick-prompt-chips">
              {QUICK_TOPICS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  className="quick-prompt-chip"
                  onClick={() => {
                    if (!title) setTitle(prompt);
                    setTopic(`An engaging breakdown exploring: ${prompt}`);
                  }}
                >
                  + {prompt}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* STEP 2: AUDIENCE */}
      {currentStep === 2 && (
        <div className="wizard-step-content">
          <div className="wizard-card-grid">
            {AUDIENCES.map((item) => {
              const isSelected = audience === item.id;
              return (
                <div
                  key={item.id}
                  className={`wizard-option-card ${isSelected ? "selected" : ""}`}
                  onClick={() => setAudience(item.id)}
                  role="radio"
                  aria-checked={isSelected}
                  tabIndex={0}
                >
                  {isSelected && <span className="check-circle">✓</span>}
                  <div>
                    <span style={{ fontSize: "20px", marginBottom: "8px", display: "inline-block" }}>
                      {item.icon}
                    </span>
                    <strong>{item.title}</strong>
                    <p>{item.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {audience === "Custom" && (
            <div style={{ marginTop: "16px" }}>
              <Field label="Specify Your Custom Audience Persona">
                <Input
                  value={customAudience}
                  onChange={(e) => setCustomAudience(e.target.value)}
                  placeholder="e.g. High school history teachers seeking 3-minute visual prompts"
                  required
                />
              </Field>
            </div>
          )}
        </div>
      )}

      {/* STEP 3: VIDEO TYPE */}
      {currentStep === 3 && (
        <div className="wizard-step-content">
          <div className="wizard-card-grid">
            {VIDEO_TYPES.map((item) => {
              const isSelected = videoType === item.id;
              return (
                <div
                  key={item.id}
                  className={`wizard-option-card ${isSelected ? "selected" : ""}`}
                  onClick={() => setVideoType(item.id)}
                  role="radio"
                  aria-checked={isSelected}
                  tabIndex={0}
                >
                  {isSelected && <span className="check-circle">✓</span>}
                  <div>
                    <span style={{ fontSize: "20px", marginBottom: "8px", display: "inline-block" }}>
                      {item.icon}
                    </span>
                    <strong>{item.title}</strong>
                    <p>{item.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* STEP 4: DURATION */}
      {currentStep === 4 && (
        <div className="wizard-step-content">
          <div className="wizard-card-grid">
            {DURATIONS.map((item) => {
              const isSelected = duration === item.seconds;
              return (
                <div
                  key={item.seconds}
                  className={`wizard-option-card ${isSelected ? "selected" : ""}`}
                  onClick={() => setDuration(item.seconds)}
                  role="radio"
                  aria-checked={isSelected}
                  tabIndex={0}
                >
                  {isSelected && <span className="check-circle">✓</span>}
                  <div>
                    <span style={{ fontSize: "20px", marginBottom: "8px", display: "inline-block" }}>
                      {item.icon}
                    </span>
                    <strong>{item.label}</strong>
                    <span className="vf-badge" style={{ margin: "4px 0 8px" }}>
                      {item.words}
                    </span>
                    <p>{item.bestFor}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* STEP 5: VISUAL STYLE */}
      {currentStep === 5 && (
        <div className="wizard-step-content">
          <div className="wizard-card-grid">
            {VISUAL_STYLES.map((item) => {
              const isSelected = visualStyle === item.id;
              return (
                <div
                  key={item.id}
                  className={`wizard-option-card ${isSelected ? "selected" : ""}`}
                  onClick={() => setVisualStyle(item.id)}
                  role="radio"
                  aria-checked={isSelected}
                  tabIndex={0}
                >
                  {isSelected && <span className="check-circle">✓</span>}
                  <div>
                    <span className="vf-badge" style={{ marginBottom: "8px" }}>
                      {item.badge}
                    </span>
                    <strong>{item.title}</strong>
                    <p>{item.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* STEP 6: NARRATION VOICE */}
      {currentStep === 6 && (
        <div className="wizard-step-content">
          <div className="wizard-card-grid">
            {VOICES.map((item) => {
              const isSelected = voiceStyle === item.id;
              return (
                <div
                  key={item.id}
                  className={`wizard-option-card ${isSelected ? "selected" : ""}`}
                  onClick={() => setVoiceStyle(item.id)}
                  role="radio"
                  aria-checked={isSelected}
                  tabIndex={0}
                >
                  {isSelected && <span className="check-circle">✓</span>}
                  <div>
                    <span className="vf-badge warning" style={{ marginBottom: "8px" }}>
                      {item.tone}
                    </span>
                    <strong>{item.title}</strong>
                    <p>{item.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* STEP 7: ASPECT RATIO */}
      {currentStep === 7 && (
        <div className="wizard-step-content">
          <div className="wizard-card-grid">
            {ASPECT_RATIOS.map((item) => {
              const isSelected = aspectRatio === item.id;
              return (
                <div
                  key={item.id}
                  className={`wizard-option-card ${isSelected ? "selected" : ""}`}
                  onClick={() => setAspectRatio(item.id)}
                  role="radio"
                  aria-checked={isSelected}
                  tabIndex={0}
                >
                  {isSelected && <span className="check-circle">✓</span>}
                  <div style={{ textAlign: "center", width: "100%" }}>
                    <div className={`wizard-aspect-preview ${item.cssClass}`}>
                      <span style={{ fontSize: "11px", fontWeight: 800 }}>{item.id}</span>
                    </div>
                    <strong>{item.title}</strong>
                    <span className="vf-badge" style={{ margin: "4px auto 8px" }}>
                      {item.dimensions}
                    </span>
                    <p>{item.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* STEP 8: REVIEW & GENERATE */}
      {currentStep === 8 && (
        <div className="wizard-step-content">
          <div className="wizard-review-box">
            <div className="wizard-review-item">
              <span>Project Title</span>
              <strong>{title}</strong>
            </div>

            <div className="wizard-review-item">
              <span>Aspect Ratio</span>
              <strong>{aspectRatio} ({ASPECT_RATIOS.find((r) => r.id === aspectRatio)?.title})</strong>
            </div>

            <div className="wizard-review-item" style={{ gridColumn: "1/-1" }}>
              <span>Topic & Core Narrative</span>
              <strong>{topic}</strong>
            </div>

            <div className="wizard-review-item">
              <span>Target Audience</span>
              <strong>{audience === "Custom" ? customAudience : audience}</strong>
            </div>

            <div className="wizard-review-item">
              <span>Video Format</span>
              <strong>{videoType}</strong>
            </div>

            <div className="wizard-review-item">
              <span>Target Duration</span>
              <strong>
                {duration < 60 ? `${duration} seconds` : `${duration / 60} minute${duration > 60 ? "s" : ""}`}
              </strong>
            </div>

            <div className="wizard-review-item">
              <span>Visual Aesthetic</span>
              <strong>{visualStyle}</strong>
            </div>

            <div className="wizard-review-item">
              <span>Narration Voice</span>
              <strong>{voiceStyle}</strong>
            </div>
          </div>

          <div className="vf-alert" style={{ marginTop: "16px" }}>
            <span>💡</span>
            <div>
              <strong>Ready for production setup.</strong>
              <p style={{ margin: "2px 0 0", fontSize: "12px" }}>
                Clicking <strong>Generate Video</strong> will initialize your project, store your settings,
                and generate the initial scene outline and script draft in your workspace.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Wizard Footer Controls */}
      <div className="wizard-footer">
        <Button
          type="button"
          variant="secondary"
          onClick={currentStep === 1 ? onClose : handleBack}
          disabled={isGenerating}
        >
          {currentStep === 1 ? "Cancel" : "← Back"}
        </Button>

        <span className="subtle" style={{ fontSize: "12px", fontWeight: 700 }}>
          Step {currentStep} of 8
        </span>

        {currentStep < 8 ? (
          <Button type="button" onClick={handleNext}>
            Continue →
          </Button>
        ) : (
          <Button type="button" onClick={handleGenerate} disabled={isGenerating}>
            🚀 Generate Video
          </Button>
        )}
      </div>
    </div>
  );
}
