import { useEffect, useMemo, useRef, useState } from "react";
import ChatBubble from "../../components/chat/ChatBubble";
import ChatInput from "../../components/chat/ChatInput";
import DashboardCard from "../../components/common/DashboardCard";
import PageHeader from "../../components/layout/PageHeader";
import { useAuth } from "../../context/AuthContext";
import RecentChats from "../../components/chat/RecentChats";
import { fetchChatSession, fetchChatSessions, sendChatMessage } from "../../services/chatService";
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

  const GREETING = { role: "assistant", text: "Ask me about your courses, uploaded PDFs, study planning, weak areas, or learning resources." };

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [messages, setMessages] = useState([GREETING]);
  const [sessions, setSessions] = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    let active = true;
    fetchChatSessions()
      .then((response) => {
        if (active) setSessions(response?.data || []);
      })
      .finally(() => {
        if (active) setSessionsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  // Keep the newest message in view as the conversation grows.
  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages, loading]);

  const refreshSessions = () => {
    fetchChatSessions().then((response) => setSessions(response?.data || []));
  };

  const startNewChat = () => {
    setActiveSessionId(null);
    setMessages([GREETING]);
    setError("");
    setInput("");
  };

  const openSession = async (session) => {
    setError("");
    setActiveSessionId(session.id);
    // The list already carries the messages, so show them immediately and only
    // refetch to pick up anything newer.
    const seed = (session.messages || []).map((item) => ({ role: item.sender, text: item.message }));
    setMessages(seed.length ? seed : [GREETING]);
    try {
      const response = await fetchChatSession(session.id);
      const fresh = (response?.data?.messages || []).map((item) => ({ role: item.sender, text: item.message }));
      if (fresh.length) setMessages(fresh);
    } catch {
      // The seeded copy is good enough; no need to interrupt the student.
    }
  };

  const ask = async (question) => {
    const text = question.trim();
    if (!text || loading) return;
    setError("");
    setMessages((current) => [...current, { role: "user", text }]);
    setInput("");
    setLoading(true);
    try {
      const response = await sendChatMessage(text, { sessionId: activeSessionId });
      const data = response.data || {};
      setMessages((current) => [...current, { role: "assistant", text: data.response || "I could not generate a response right now." }]);
      if (data.session_id) setActiveSessionId(data.session_id);
      refreshSessions();
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
          {/* Sized to the viewport on small screens; a flat 660px overflowed
              short phones and pushed the composer below the fold. */}
          <div ref={scrollRef} className="scrollbar-soft flex h-[55vh] min-h-[320px] flex-col gap-4 overflow-y-auto rounded-[1.35rem] bg-pilot-ice p-3 sm:p-4 lg:h-[660px]">
            {messages.map((message, index) => <ChatBubble key={`${message.role}-${index}`} role={message.role}>{message.text}</ChatBubble>)}
            {loading && <div className="rounded-2xl bg-white px-4 py-3 text-sm font-bold text-pilot-blue shadow-soft">StudyPilot is writing a response...</div>}
          </div>
          {error && <p className="mt-4 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p>}
          <div className="mt-4">
            <ChatInput value={input} onChange={setInput} onSubmit={submit} disabled={loading} />
          </div>
        </section>

        <div className="space-y-6 xl:sticky xl:top-6 xl:self-start">
          <RecentChats
            sessions={sessions}
            activeId={activeSessionId}
            onSelect={openSession}
            onNew={startNewChat}
            loading={sessionsLoading}
          />

          <DashboardCard title="Suggested Questions For You">
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
    </div>
  );
}
