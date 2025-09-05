const Project = require('../models/Project');
const UserIntegration = require('../models/UserIntegration');
const responseHandler = require('../utils/response.handler');
const githubService = require('../services/github.service');
const jiraService = require('../services/jira.service');
const notionService = require('../services/notion.service');
const fs = require('fs').promises;
const path = require('path');

class ProjectController {
    
    async createProject(req, res) {
        try {
            const { name, description, status, mcpResources, icon, attachments } = req.body;
            const userId = req.user._id;

            const projectData = {
                userId,
                name,
                description,
                status: status || 'active',
                mcpResources: mcpResources || {
                    notion: { enabled: false, resources: [] },
                    github: { enabled: false, resources: [] },
                    jira: { enabled: false, resources: [] }
                }
            };

            // Handle icon if provided (expecting file object with path)
            if (icon) {
                projectData.icon = icon;
            }

            // Handle attachments if provided (expecting array of file objects with paths)
            if (attachments && Array.isArray(attachments)) {
                // Validate that all attachments are PDFs
                const nonPdfAttachments = attachments.filter(file => file.mimetype !== 'application/pdf');
                if (nonPdfAttachments.length > 0) {
                    return responseHandler.error(res, 'All attachments must be PDF files', 400);
                }
                
                projectData.attachments = attachments.map(file => ({
                    ...file,
                    uploadedAt: new Date()
                }));
            }

            const project = new Project(projectData);
            await project.save();

            return responseHandler.created(res, { project }, 'Project created successfully');
        } catch (error) {
            console.error('Create project error:', error);
            return responseHandler.error(res, error.message || 'Failed to create project', 500, error);
        }
    }

    async getProjects(req, res) {
        try {
            const userId = req.user._id;
            const { status, page = 1, limit = 10, search, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;

            const options = {
                status,
                sort: { [sortBy]: sortOrder === 'desc' ? -1 : 1 },
                limit: parseInt(limit),
                skip: (parseInt(page) - 1) * parseInt(limit)
            };

            let projects;
            if (search) {
                projects = await Project.find({
                    userId,
                    isDeleted: false,
                    $text: { $search: search },
                    ...(status && { status })
                })
                .sort(options.sort)
                .limit(options.limit)
                .skip(options.skip);
            } else {
                projects = await Project.findByUserId(userId, options);
            }

            const total = await Project.countDocuments({
                userId,
                isDeleted: false,
                ...(status && { status }),
                ...(search && { $text: { $search: search } })
            });

            return responseHandler.paginated(res, projects, parseInt(page), parseInt(limit), total, 'Projects retrieved successfully');
        } catch (error) {
            console.error('Get projects error:', error);
            return responseHandler.error(res, 'Failed to retrieve projects', 500, error);
        }
    }

    async getProject(req, res) {
        try {
            const { projectId } = req.params;
            const userId = req.user._id;

            const project = await Project.findByUserIdAndProjectId(userId, projectId);

            if (!project) {
                return responseHandler.notFound(res, 'Project not found');
            }

            return responseHandler.success(res, { project }, 'Project retrieved successfully');
        } catch (error) {
            console.error('Get project error:', error);
            return responseHandler.error(res, 'Failed to retrieve project', 500, error);
        }
    }

    async updateProject(req, res) {
        try {
            const { projectId } = req.params;
            const userId = req.user._id;
            const updateData = req.body;

            const project = await Project.findByUserIdAndProjectId(userId, projectId);
            if (!project) {
                return responseHandler.notFound(res, 'Project not found');
            }

            // Handle icon update if provided
            if (updateData.icon) {
                // Delete old icon if exists and it's different
                if (project.icon && project.icon.path && project.icon.path !== updateData.icon.path) {
                    try {
                        await fs.unlink(project.icon.path);
                    } catch (err) {
                        console.warn('Failed to delete old icon:', err.message);
                    }
                }
            }

            // Handle attachments update if provided
            if (updateData.attachments && Array.isArray(updateData.attachments)) {
                // Validate that all attachments are PDFs
                const nonPdfAttachments = updateData.attachments.filter(file => file.mimetype !== 'application/pdf');
                if (nonPdfAttachments.length > 0) {
                    return responseHandler.error(res, 'All attachments must be PDF files', 400);
                }
                
                updateData.attachments = updateData.attachments.map(file => ({
                    ...file,
                    uploadedAt: file.uploadedAt || new Date()
                }));
            }

            Object.assign(project, updateData);
            await project.save();

            return responseHandler.success(res, { project }, 'Project updated successfully');
        } catch (error) {
            console.error('Update project error:', error);
            return responseHandler.error(res, error.message || 'Failed to update project', 500, error);
        }
    }

    async deleteProject(req, res) {
        try {
            const { projectId } = req.params;
            const userId = req.user._id;

            const project = await Project.findByUserIdAndProjectId(userId, projectId);
            if (!project) {
                return responseHandler.notFound(res, 'Project not found');
            }

            await project.softDelete();

            return responseHandler.success(res, null, 'Project deleted successfully');
        } catch (error) {
            console.error('Delete project error:', error);
            return responseHandler.error(res, 'Failed to delete project', 500, error);
        }
    }

    async removeAttachment(req, res) {
        try {
            const { projectId, attachmentId } = req.params;
            const userId = req.user._id;

            const project = await Project.findByUserIdAndProjectId(userId, projectId);
            if (!project) {
                return responseHandler.notFound(res, 'Project not found');
            }

            const attachment = project.attachments.id(attachmentId);
            if (!attachment) {
                return responseHandler.notFound(res, 'Attachment not found');
            }

            // Delete file from filesystem
            try {
                await fs.unlink(attachment.path);
            } catch (err) {
                console.warn('Failed to delete attachment file:', err.message);
            }

            project.attachments.pull(attachmentId);
            await project.save();

            return responseHandler.success(res, null, 'Attachment removed successfully');
        } catch (error) {
            console.error('Remove attachment error:', error);
            return responseHandler.error(res, 'Failed to remove attachment', 500, error);
        }
    }



    async getProjectResources(req, res) {
        try {
            const { projectId } = req.params;
            const userId = req.user._id;

            const project = await Project.findByUserIdAndProjectId(userId, projectId);
            if (!project) {
                return responseHandler.notFound(res, 'Project not found');
            }

            const allResources = project.getAllResources();

            return responseHandler.success(res, {
                resources: allResources,
                summary: {
                    total: allResources.length,
                    notion: project.getResourcesByService('notion').length,
                    github: project.getResourcesByService('github').length,
                    jira: project.getResourcesByService('jira').length
                }
            }, 'Project resources retrieved successfully');
        } catch (error) {
            console.error('Get project resources error:', error);
            return responseHandler.error(res, 'Failed to get project resources', 500, error);
        }
    }

    async getProjectResourcesByService(req, res) {
        try {
            const { projectId, service } = req.params;
            const userId = req.user._id;

            const project = await Project.findByUserIdAndProjectId(userId, projectId);
            if (!project) {
                return responseHandler.notFound(res, 'Project not found');
            }

            const resources = project.getResourcesByService(service);

            return responseHandler.success(res, {
                resources,
                service,
                enabled: project.mcpResources[service]?.enabled || false
            }, `${service} resources retrieved successfully`);
        } catch (error) {
            console.error('Get project resources by service error:', error);
            return responseHandler.error(res, 'Failed to get project resources', 500, error);
        }
    }


    async getAvailableResources(req, res) {
        try {
            const { service } = req.params;
            const userId = req.user._id;
            const { page = 1, limit = 30 } = req.query;

            // Check if user has the integration connected
            const integration = await UserIntegration.findOne({
                userId,
                integrationId: service,
                status: 'connected'
            });

            if (!integration) {
                return responseHandler.notFound(res, `${service} integration not found or not connected`);
            }

            let resources = [];

            try {
                switch (service) {
                    case 'github':
                        resources = await githubService.getRepositories(
                            integration.connectionData.accessToken,
                            {
                                page: parseInt(page),
                                per_page: parseInt(limit),
                                type: 'all',
                                sort: 'updated'
                            }
                        );
                        break;

                    case 'jira':
                        const cloudId = integration.connectionData.resources?.[0]?.id;
                        if (!cloudId) {
                            return responseHandler.error(res, 'No Jira cloud ID available', 400);
                        }

                        // Get both projects and boards
                        const [projects, boardsData] = await Promise.all([
                            jiraService.getProjects(integration.connectionData.accessToken, cloudId),
                            jiraService.getBoards(integration.connectionData.accessToken, cloudId, {
                                maxResults: parseInt(limit),
                                startAt: (parseInt(page) - 1) * parseInt(limit)
                            })
                        ]);

                        resources = [
                            ...projects.map(project => ({
                                ...project,
                                resourceType: 'project',
                                resourceId: project.id
                            })),
                            ...boardsData.boards.map(board => ({
                                ...board,
                                resourceType: 'board',
                                resourceId: board.id.toString()
                            }))
                        ];
                        break;

                    case 'notion':
                        const [databases, pages] = await Promise.all([
                            notionService.getDatabases(integration.connectionData.accessToken, { page_size: parseInt(limit) }).catch(() => []),
                            notionService.getPages(integration.connectionData.accessToken, { page_size: parseInt(limit) }).catch(() => [])
                        ]);

                        resources = [
                            ...(databases || []).map(db => ({
                                ...db,
                                resourceType: 'database',
                                resourceId: db.id
                            })),
                            ...(pages || []).map(page => ({
                                ...page,
                                resourceType: 'page',
                                resourceId: page.id
                            }))
                        ];
                        break;

                    default:
                        return responseHandler.error(res, 'Invalid service', 400);
                }

                return responseHandler.success(res, {
                    resources,
                    service,
                    integration: {
                        id: integration._id,
                        name: integration.integrationName,
                        status: integration.status,
                        connectedAt: integration.metadata?.connectedAt
                    }
                }, `Available ${service} resources retrieved successfully`);

            } catch (serviceError) {
                console.error(`${service} service error:`, serviceError);
                return responseHandler.error(res, `Failed to fetch ${service} resources: ${serviceError.message}`, 500);
            }

        } catch (error) {
            console.error('Get available resources error:', error);
            return responseHandler.error(res, 'Failed to get available resources', 500, error);
        }
    }

    // ===========================================
    // PROMPT SUGGESTIONS METHODS
    // ===========================================

    async getPromptSuggestions(req, res) {
        try {
            const { id: projectId } = req.params;
            const userId = req.user._id;

            // Find and validate project
            const project = await Project.findOne({
                _id: projectId,
                userId,
                isDeleted: false
            });

            if (!project) {
                return responseHandler.notFound(res, 'Project not found');
            }

            // Generate context-aware suggestions based on project data
            const suggestions = this._generateContextualSuggestions(project);

            return responseHandler.success(res, {
                suggestions,
                projectId,
                projectName: project.name,
                totalSuggestions: suggestions.length
            }, 'Prompt suggestions retrieved successfully');

        } catch (error) {
            console.error('Get prompt suggestions error:', error);
            return responseHandler.error(res, 'Failed to get prompt suggestions', 500, error);
        }
    }

    async generatePromptSuggestions(req, res) {
        try {
            const { id: projectId } = req.params;
            const { context, category } = req.body;
            const userId = req.user._id;

            // Find and validate project
            const project = await Project.findOne({
                _id: projectId,
                userId,
                isDeleted: false
            });

            if (!project) {
                return responseHandler.notFound(res, 'Project not found');
            }

            // Generate dynamic suggestions based on context and category
            const suggestions = this._generateDynamicSuggestions(project, context, category);

            return responseHandler.success(res, {
                suggestions,
                projectId,
                projectName: project.name,
                category,
                context,
                totalSuggestions: suggestions.length
            }, 'Dynamic prompt suggestions generated successfully');

        } catch (error) {
            console.error('Generate prompt suggestions error:', error);
            return responseHandler.error(res, 'Failed to generate prompt suggestions', 500, error);
        }
    }

    // ===========================================
    // PRIVATE HELPER METHODS FOR PROMPT SUGGESTIONS
    // ===========================================

    _generateContextualSuggestions(project) {
        const suggestions = [];
        const projectName = project.name;
        const hasDescription = project.description && project.description.trim().length > 0;
        const hasAttachments = project.attachments && project.attachments.length > 0;
        const hasIntegrations = project.mcpResources && 
            (project.mcpResources.notion?.enabled || 
             project.mcpResources.github?.enabled || 
             project.mcpResources.jira?.enabled);

        // Base analysis suggestions
        suggestions.push(
            `Analyze the ${projectName} project requirements and provide a detailed implementation roadmap`,
            `Review the ${projectName} project structure and suggest architectural improvements`,
            `Identify potential risks and challenges in the ${projectName} project`
        );

        // Context-specific suggestions based on project data
        if (hasDescription) {
            suggestions.push(
                `Based on the project description, break down ${projectName} into manageable development phases`,
                `Suggest best practices and coding standards for the ${projectName} project`
            );
        }

        if (hasAttachments) {
            suggestions.push(
                `Analyze the uploaded documents and extract key requirements for ${projectName}`,
                `Generate a technical specification based on the project documentation`
            );
        }

        if (hasIntegrations) {
            if (project.mcpResources.notion?.enabled) {
                suggestions.push(
                    `Sync project requirements with Notion and create a development timeline`,
                    `Generate project documentation in Notion based on current progress`
                );
            }
            
            if (project.mcpResources.github?.enabled) {
                suggestions.push(
                    `Review GitHub repository structure and suggest code organization improvements`,
                    `Analyze recent commits and provide code quality feedback`,
                    `Generate GitHub issues based on project requirements`
                );
            }
            
            if (project.mcpResources.jira?.enabled) {
                suggestions.push(
                    `Create Jira tickets for upcoming development tasks`,
                    `Analyze current Jira issues and suggest prioritization strategy`
                );
            }
        }

        // Generic productive suggestions
        suggestions.push(
            `Create a comprehensive testing strategy for ${projectName}`,
            `Generate API documentation for the ${projectName} endpoints`,
            `Suggest performance optimization techniques for ${projectName}`,
            `Create a deployment checklist for ${projectName}`,
            `Design error handling and logging strategies for ${projectName}`
        );

        // Randomize and limit suggestions
        return this._shuffleArray(suggestions).slice(0, 8);
    }

    _generateDynamicSuggestions(project, context, category) {
        const projectName = project.name;
        const baseSuggestions = {
            analysis: [
                `Perform a deep technical analysis of ${projectName} focusing on ${context || 'architecture'}`,
                `Evaluate the current ${projectName} implementation and identify bottlenecks`,
                `Conduct a security audit for the ${projectName} project`,
                `Analyze user experience and interface design for ${projectName}`
            ],
            implementation: [
                `Implement ${context || 'core functionality'} for the ${projectName} project`,
                `Create modular components for ${projectName} with best practices`,
                `Set up CI/CD pipeline for ${projectName} deployment`,
                `Implement authentication and authorization for ${projectName}`
            ],
            testing: [
                `Design comprehensive unit tests for ${projectName} ${context || 'components'}`,
                `Create integration test suite for ${projectName}`,
                `Implement end-to-end testing strategy for ${projectName}`,
                `Set up performance testing for ${projectName} critical paths`
            ],
            documentation: [
                `Generate comprehensive API documentation for ${projectName}`,
                `Create user guide and tutorials for ${projectName}`,
                `Document deployment and maintenance procedures for ${projectName}`,
                `Write technical specifications for ${projectName} ${context || 'features'}`
            ],
            optimization: [
                `Optimize ${projectName} for better performance and scalability`,
                `Implement caching strategies for ${projectName}`,
                `Refactor ${projectName} codebase for maintainability`,
                `Optimize database queries and data structures in ${projectName}`
            ]
        };

        const suggestions = category && baseSuggestions[category] 
            ? baseSuggestions[category] 
            : Object.values(baseSuggestions).flat();

        return this._shuffleArray(suggestions).slice(0, 6);
    }

    _shuffleArray(array) {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }

}

module.exports = ProjectController;
