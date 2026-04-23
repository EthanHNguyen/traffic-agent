with open('apps/web/components/ChatPanel.tsx', 'r') as f:
    content = f.read()

# Add the onKeyDown handler to the handleSubmit logic
old_textarea = """        <textarea
          id="traffic-question"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          rows={3}
          className="w-full resize-none rounded-md border border-road/15 bg-white p-3 text-sm outline-none ring-mile/30 transition focus:border-mile focus:ring-4"
          placeholder="Ask FlowOps..."
        />"""

new_textarea = """        <textarea
          id="traffic-question"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              const form = e.currentTarget.form;
              if (form) form.requestSubmit();
            }
          }}
          rows={3}
          className="w-full resize-none rounded-md border border-road/15 bg-white p-3 text-sm outline-none ring-mile/30 transition focus:border-mile focus:ring-4"
          placeholder="Ask FlowOps..."
        />"""

content = content.replace(old_textarea, new_textarea)

with open('apps/web/components/ChatPanel.tsx', 'w') as f:
    f.write(content)
