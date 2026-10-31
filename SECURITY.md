# Security Policy

## Project: GeoVision
**Post-Disaster Building Damage Assessment from Satellite Imagery**

GeoVision is an academic research project that uses deep learning and satellite imagery to classify building damage following natural disasters. This policy describes how security vulnerabilities should be reported and how project-related data and resources should be handled responsibly.

## 1. Supported Versions

Security updates and vulnerability fixes will primarily be applied to the latest development version of GeoVision.

| Version | Security Support |
|---|---|
| Latest version | Supported |
| Older versions | Not guaranteed |
| Experimental versions | Not guaranteed |

## 2. Reporting a Security Vulnerability

If you discover a security vulnerability in GeoVision, please report it responsibly.

**Preferred reporting method:**

- Use GitHub's private vulnerability reporting feature, if enabled for this repository.
- Alternatively, contact the repository maintainer through the contact information provided in the GitHub profile.

When reporting a vulnerability, please include:

- A clear description of the vulnerability.
- Steps to reproduce the issue.
- Potential security impact.
- Relevant logs, screenshots, or proof of concept, if available.
- Suggested mitigation, if known.

Please do not publicly disclose security vulnerabilities before the maintainer has had a reasonable opportunity to investigate and address them.

## 3. Data Protection and Privacy

GeoVision may use satellite imagery, building-level annotations, and derived image crops for research purposes.

Contributors must:

- Respect the original dataset's license and terms of use.
- Avoid uploading private, confidential, or personally identifiable information.
- Never publish sensitive information obtained from external datasets.
- Verify that datasets and derived materials may legally be redistributed before uploading them.
- Avoid committing large datasets or sensitive research materials directly to the repository.

## 4. Model and Checkpoint Security

GeoVision uses machine learning models, including PyTorch-based ResNet architectures.

Contributors should:

- Only use model weights from trusted sources.
- Treat downloaded model checkpoints as untrusted until verified.
- Avoid loading untrusted PyTorch checkpoint files.
- Never execute unknown scripts or serialized model files without reviewing their source and origin.
- Document the source of pretrained weights and model dependencies.
- Keep model checkpoints and large training artifacts outside the source repository unless explicitly required.

**Important:** PyTorch checkpoint files may contain executable serialized objects. Use safer loading options, such as `weights_only=True` where supported, and only load files from trusted sources.

## 5. Code and Dependency Security

Contributors should:

- Use trusted Python packages and official package repositories.
- Keep dependencies reasonably up to date.
- Review third-party code before integrating it.
- Avoid executing unknown shell commands or scripts.
- Validate file paths and user-provided inputs.
- Avoid hardcoding credentials, API keys, passwords, or access tokens.
- Use environment variables or local configuration files for secrets.

Files containing credentials or private configuration must not be committed to GitHub.

## 6. GitHub Repository Security

The following practices are recommended:

- Enable GitHub secret scanning and push protection when available.
- Enable Dependabot alerts when available.
- Use `.gitignore` to exclude virtual environments, local datasets, checkpoints, and sensitive files.
- Review changes before merging pull requests.
- Apply the principle of least privilege when granting repository access.
- Use strong authentication and enable two-factor authentication on GitHub.

## 7. Responsible Use

GeoVision is intended for academic research and disaster-response support.

Its predictions should not be treated as definitive assessments of structural safety. Model outputs must be reviewed by qualified professionals before being used in real-world emergency response, evacuation, reconstruction, or resource-allocation decisions.

Users must not intentionally use this project to violate privacy, access restricted information, or cause harm.

## 8. Scope and Disclaimer

This policy applies to the GeoVision source code, project configuration, model implementations, and repository-maintained resources.

It does not replace the security policies or licensing requirements of external datasets, libraries, or pretrained models.

GeoVision is an academic research project and is provided "AS IS", without guarantees that it is free from security vulnerabilities or suitable for safety-critical deployment.

---

**Maintainer:** GeoVision Project Maintainer  
**Repository:** https://github.com/al-tushar/geovision-app  
**Last Updated:** October 2026
