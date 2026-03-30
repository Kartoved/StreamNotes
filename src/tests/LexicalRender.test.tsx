import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { LexicalRender } from '../components/LexicalEditor';
import React from 'react';

// Тестируем логику рендеринга и кастомных 3-х статусных чекбоксов
describe('LexicalRender Checkbox Behavior', () => {
  const astWithCheckboxes = JSON.stringify({
    root: {
      children: [
        {
          type: "list",
          listType: "check",
          children: [
            { type: "listitem", checked: false, value: 1, children: [{ type: "text", text: "To do task" }] },
            { type: "listitem", checked: true, value: 2, children: [{ type: "text", text: "Done task" }] },
            { type: "listitem", checked: true, value: 3, children: [{ type: "text", text: "Cancelled task" }] }
          ]
        }
      ]
    }
  });

  it('renders correctly with correct texts', () => {
    render(<LexicalRender astString={astWithCheckboxes} />);
    expect(screen.getByText('To do task')).toBeDefined();
    expect(screen.getByText('Done task')).toBeDefined();
    expect(screen.getByText('Cancelled task')).toBeDefined();
  });

  it('updates state via 3-state checkbox clicks in view mode', () => {
    let newAst = "";
    
    // Мокаем функцию обновления AST, которую передает Feed
    const onUpdateAST = vi.fn((ast) => {
        newAst = ast;
    });
    const { container } = render(<LexicalRender astString={astWithCheckboxes} onUpdateAST={onUpdateAST} />);
    
    // Находим чекбоксы (они рендерятся как <div> внутри <li>)
    const checkboxes = container.querySelectorAll('li > div');
    expect(checkboxes.length).toBe(3);

    // Кликаем по первому (unchecked -> done)
    fireEvent.click(checkboxes[0]!);
    expect(onUpdateAST).toHaveBeenCalledTimes(1);
    let parsed = JSON.parse(newAst).root;
    expect(parsed.children[0].children[0].value).toBe(2);
    expect(parsed.children[0].children[0].checked).toBe(true);

    // Эмулируем, что обновились пропсы и кликаем по второму (done -> cancelled)
    fireEvent.click(checkboxes[1]!);
    parsed = JSON.parse(newAst).root;
    expect(parsed.children[0].children[1].value).toBe(3);
    expect(parsed.children[0].children[1].checked).toBe(true);

    // Кликаем по третьему (cancelled -> unchecked)
    fireEvent.click(checkboxes[2]!);
    parsed = JSON.parse(newAst).root;
    expect(parsed.children[0].children[2].value).toBe(1);
    expect(parsed.children[0].children[2].checked).toBe(false);
  });
});
