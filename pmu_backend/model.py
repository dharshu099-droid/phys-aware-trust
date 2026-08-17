from __future__ import annotations

import torch
from ncps.torch import CfC
from torch import nn
from torch.nn import functional as F


class EvidentialCfC(nn.Module):
    def __init__(self, input_size: int, hidden_size: int = 48):
        super().__init__()
        self.cfc = CfC(input_size, hidden_size, batch_first=True, return_sequences=False)
        self.head = nn.Sequential(nn.LayerNorm(hidden_size), nn.Linear(hidden_size, 2))

    def forward(self, x: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        state, _ = self.cfc(x)
        evidence = F.softplus(self.head(state))
        alpha = evidence + 1.0
        probabilities = alpha / alpha.sum(dim=-1, keepdim=True)
        uncertainty = 2.0 / alpha.sum(dim=-1)
        return evidence, probabilities, uncertainty


def evidential_loss(evidence: torch.Tensor, target: torch.Tensor, epoch: int, epochs: int) -> torch.Tensor:
    alpha = evidence + 1.0
    strength = alpha.sum(dim=1, keepdim=True)
    one_hot = F.one_hot(target, num_classes=2).float()
    data_fit = torch.sum(one_hot * (torch.digamma(strength) - torch.digamma(alpha)), dim=1)
    adjusted = one_hot + (1.0 - one_hot) * alpha
    adjusted_strength = adjusted.sum(dim=1, keepdim=True)
    prior = torch.ones_like(adjusted)
    log_beta = torch.lgamma(adjusted_strength) - torch.lgamma(adjusted).sum(dim=1, keepdim=True)
    log_beta_prior = torch.lgamma(prior).sum(dim=1, keepdim=True) - torch.lgamma(prior.sum(dim=1, keepdim=True))
    kl = ((adjusted - prior) * (torch.digamma(adjusted) - torch.digamma(adjusted_strength))).sum(dim=1, keepdim=True) + log_beta + log_beta_prior
    anneal = min(1.0, (epoch + 1) / max(1, epochs // 3))
    return (data_fit + anneal * 0.01 * kl.squeeze(1)).mean()
