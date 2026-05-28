import { useMemo, useState } from "react";
import ChatBubble from "../../components/chat/ChatBubble";
import ChatInput from "../../components/chat/ChatInput";
import DashboardCard from "../../components/common/DashboardCard";
import PageHeader from "../../components/layout/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { sendChatMessage } from "../../services/chatService";
import { getCourseCode, getCourseLabel, getCourses } from "../../utils/user";

export default function AIAdvisorPage() {
  const { user } = useAuth();
  const courses = getCourses(user);
  const prompts = useMemo(() => {
    if (!user?.profile_completed) {
      return [
        "Ask me about my academic goals.",
        "Help me organize my study plan.",
        "Recommend how to use StudyPilot effectively."
      ];
    }
    const coursePrompts = courses.flatMap((course) => [
      `Explain ${getCourseCode(course) || getCourseLabel(course)} in simple terms.`,
      `Create a study plan for ${course.title || getCourseLabel(course)}.`
    ]);
    const weak = Array.isArray(user?.weak_courses) ? user.weak_courses.map((item) => `Recommend YouTube tutorials for ${item}.`) : [];
    return [
      ...coursePrompts,
      ...weak,
      "Generate revision questions from my uploaded PDFs.",
      "What should I focus on this week based on my academic goal?",
      "How can I prepare for my exams with my current study hours?",
      "Summarize my saved resources into a study plan.",
      "Which topic should I revise first?"
    ].slice(0, 9);
  }, [courses, user]);

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [messages, setMessages] = useState([
    { role: "assistant", text: "Ask me about your courses, uploaded PDFs, study planning, weak areas, or learning resources." }
  ]);

  const ask = async (question) => {
    const text = question.trim();
    if (!text || loading) return;
    setError("");
    setMessages((current) => [...current, { role: "user", text }]);
    setInput("");
    setLoading(true);
    try {
      const response = await sendChatMessage(text);
      const data = response.data || {};
      setMessages((current) => [...current, { role: "assistant", text: data.response || "I could not generate a response right now." }]);
    } catch (chatError) {
      setError(chatError.message || "AI Advisor could not respond right now.");
    } finally {
      setLoading(false);
    }
  };

  const submit = (event) => {
    event.preventDefault();
    ask(input);
  };

  return (
    <div>
      <PageHeader title="AI Advisor" subtitle="Ask StudyPilot for academic guidance based on your profile, PDFs, and study goals." />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="rounded-[1.75rem] border border-pilot-line bg-white p-4 shadow-soft">
          <div className="scrollbar-soft flex h-[660px] flex-col gap-4 overflow-y-auto rounded-[1.35rem] bg-pilot-ice p-4">
            {messages.map((message, index) => <ChatBubble key={`${message.role}-${index}`} role={message.role}>{message.text}</ChatBubble>)}
            {loading && <div className="rounded-2xl bg-white px-4 py-3 text-sm font-bold text-pilot-blue shadow-soft">StudyPilot is writing a response...</div>}
          </div>
          {error && <p className="mt-4 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p>}
          <div className="mt-4">
            <ChatInput value={input} onChange={setInput} onSubmit={submit} disabled={loading} />
          </div>
        </section>

        <DashboardCard title="Suggested Questions For You" className="xl:sticky xl:top-6 xl:self-start">
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            {prompts.map((question) => (
              <button
                key={question}
                onClick={() => ask(question)}
                className="rounded-2xl border border-pilot-line bg-pilot-ice p-4 text-left text-sm font-bold leading-6 text-pilot-muted transition hover:-translate-y-0.5 hover:border-pilot-blue hover:bg-white hover:text-pilot-blue hover:shadow-soft"
              >
                {question}
              </button>
            ))}
          </div>
        </DashboardCard>
      </div>
    </div>
  );
}
