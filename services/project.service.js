// project.service.js

const Project = require('../models/Project');

module.exports = {
    getPromptSuggestions: async (projectId) => {
        // Example: fetch project and tailor prompts
        const project = await Project.findById(projectId).lean();
        if (!project) {
            return ['Project not found.'];
        }
        // Example logic: tailor prompts based on project fields
        const prompts = [
            `How do I add a new resource to ${project.name}?`,
            `Show me recent activity for ${project.name}.`,
            `What integrations are enabled for ${project.name}?`,
            `How do I archive ${project.name}?`,
            `List all team members in ${project.name}.`
        ];
        return prompts;
    }
};
