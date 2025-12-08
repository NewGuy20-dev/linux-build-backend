import { BuildSpec } from '../ai/schema';

export function generateZshSetup(spec: BuildSpec): string {
  const lines = ['#!/bin/bash'];
  
  if (spec.customization?.shellFramework === 'oh-my-zsh') {
    lines.push('sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)" "" --unattended');
  }

  if (spec.customization?.shellTheme === 'powerlevel10k') {
    lines.push('git clone --depth=1 https://github.com/romkatv/powerlevel10k.git ${ZSH_CUSTOM:-$HOME/.oh-my-zsh/custom}/themes/powerlevel10k');
  }

  return lines.join('\n');
}

export function generateStarshipConfig(): string {
  return `[character]
success_symbol = "[➜](bold green)"
error_symbol = "[✗](bold red)"

[directory]
truncation_length = 3

[git_branch]
symbol = " "
`;
}

export function generateShellRc(spec: BuildSpec): string {
  const shell = spec.customization?.shell || 'bash';
  const lines: string[] = [];

  if (shell === 'zsh') {
    if (spec.customization?.shellFramework === 'oh-my-zsh') {
      lines.push('export ZSH="$HOME/.oh-my-zsh"');
      lines.push(`ZSH_THEME="${spec.customization?.shellTheme === 'powerlevel10k' ? 'powerlevel10k/powerlevel10k' : 'robbyrussell'}"`);
      lines.push('plugins=(git docker kubectl)');
      lines.push('source $ZSH/oh-my-zsh.sh');
    }
    if (spec.customization?.shellTheme === 'starship') {
      lines.push('eval "$(starship init zsh)"');
    }
  } else if (shell === 'bash') {
    if (spec.customization?.shellTheme === 'starship') {
      lines.push('eval "$(starship init bash)"');
    }
  } else if (shell === 'fish') {
    if (spec.customization?.shellTheme === 'starship') {
      lines.push('starship init fish | source');
    }
  }

  return lines.join('\n');
}

export function getShellPath(shell: string): string {
  const paths: Record<string, string> = {
    bash: '/bin/bash',
    zsh: '/bin/zsh',
    fish: '/usr/bin/fish',
  };
  return paths[shell] || '/bin/bash';
}
